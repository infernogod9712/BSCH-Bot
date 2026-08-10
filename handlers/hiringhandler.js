// handlers/hiringhandler.js
// The hiring system's interaction logic. Handles the "Hire Us" button, the
// intake modal, claiming, and (later) the whole case command flow.

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ChannelType,
} = require("discord.js");

const store = require("../hire/store");

module.exports = {
    async handle(interaction, client, config) {
        // Clicked "Hire Us" on the panel -> show the intake questions
        if (interaction.isButton() && interaction.customId === "hire_open") {
            return openIntakeModal(interaction);
        }

        // Submitted the intake modal -> create the whole case
        if (interaction.isModalSubmit() && interaction.customId === "hiremodal") {
            return createHireTicket(interaction, client, config);
        }

        // Clicked Claim -> assign Lead + update both the ticket and case file
        if (interaction.isButton() && interaction.customId === "hire_claim") {
            return claimCase(interaction, client, config);
        }
    }
};

// ------------------------------------------------------------------
// Step 2 — pop up the intake modal
// ------------------------------------------------------------------
async function openIntakeModal(interaction) {
    // Block a client who already has a hire case open
    const existing = store.getOpenCaseByClient(interaction.user.id);
    if (existing) {
        return interaction.reply({
            content: "❌ You already have an open hire case. Please use that ticket instead.",
            flags: 64
        });
    }

    const modal = new ModalBuilder()
        .setCustomId("hiremodal")
        .setTitle("Hire BSCH — Tell us about your build");

    // Discord modals allow up to 5 inputs, each in its own row.
    const concept = new TextInputBuilder()
        .setCustomId("concept")
        .setLabel("Concept / what are you looking for?")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Describe your server in as much detail as you can.")
        .setRequired(true)
        .setMaxLength(1000);

    const references = new TextInputBuilder()
        .setCustomId("references")
        .setLabel("Reference server links (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

    const timeframe = new TextInputBuilder()
        .setCustomId("timeframe")
        .setLabel("Timeframe / deadline (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);

    const anythingElse = new TextInputBuilder()
        .setCustomId("anythingElse")
        .setLabel("Anything else? (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(concept),
        new ActionRowBuilder().addComponents(references),
        new ActionRowBuilder().addComponents(timeframe),
        new ActionRowBuilder().addComponents(anythingElse),
    );

    await interaction.showModal(modal);
}

// ------------------------------------------------------------------
// Step 3 — build the whole case from the modal answers
// ------------------------------------------------------------------
async function createHireTicket(interaction, client, config) {
    await interaction.deferReply({ flags: 64 });

    const guild = interaction.guild;
    const user = interaction.user;

    // 1) Save the case first — this assigns the unique ticketId
    const record = store.createCase({
        clientId: user.id,
        intake: {
            concept: interaction.fields.getTextInputValue("concept"),
            references: interaction.fields.getTextInputValue("references"),
            timeframe: interaction.fields.getTextInputValue("timeframe"),
            anythingElse: interaction.fields.getTextInputValue("anythingElse"),
        },
    });

    // 2) Work out who can see the ticket: the client, all Builders, Senior Staff
    const seniorIds = (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
    ];

    if (config.roles.builder) {
        overwrites.push({
            id: config.roles.builder,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        });
    }

    for (const roleId of seniorIds) {
        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
            ],
        });
    }

    // 3) Create the ticket channel: hire-[user]-[ticketId]
    const channel = await guild.channels.create({
        name: `hire-${user.username}-${record.ticketId}`
            .toLowerCase()
            .replace(/[^a-z0-9\-]/g, ""),
        type: ChannelType.GuildText,
        parent: config.categories.hireTickets,
        topic: `Hire case ${record.ticketId} for ${user.id}`,
        permissionOverwrites: overwrites,
    });

    // 4) Build history lookup (SOP: shows the client's past builds up front)
    const closed = store.getClosedCasesByClient(user.id);
    const historyText = closed.length
        ? closed.map(c => `#${c.ticketId}`).join(", ")
        : "First-time client (no past builds).";

    const caseEmbed = buildCaseEmbed(record, historyText);

    // 5) Create the forum case-file post in hire-bsch-case-logs
    let forumThread = null;
    const forum = guild.channels.cache.get(config.channels.hireCaseLogsForum);
    if (forum && forum.type === ChannelType.GuildForum) {
        forumThread = await forum.threads.create({
            name: `#${record.ticketId} - ${user.username}`,
            message: { embeds: [caseEmbed] },
        });
    }

    // 6) Post the first embed + Claim button into the ticket
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("hire_claim")
            .setLabel("✋ Claim Case")
            .setStyle(ButtonStyle.Success)
    );

    const embedMessage = await channel.send({
        content: `<@${user.id}>`,
        embeds: [caseEmbed],
        components: [row],
    });

    // 7) Save the channel + forum + embed-message ids back onto the case
    store.updateCase(record.ticketId, {
        channelId: channel.id,
        forumThreadId: forumThread ? forumThread.id : null,
        embedMessageId: embedMessage.id,
    });

    return interaction.editReply({
        content:
            `✅ Your hire ticket has been created: ${channel}` +
            (forumThread ? "" : "\n⚠️ (Case-file forum post could not be created — check that hireCaseLogsForum is a Forum channel.)"),
    });
}

// ------------------------------------------------------------------
// Shared: render a case record into an embed.
// Used for BOTH the ticket embed and the forum case-file post, so the two
// always show the same thing (the SOP's "ticket and case file must agree").
// ------------------------------------------------------------------
function buildCaseEmbed(record, historyText) {
    const i = record.intake || {};

    const helpers = record.roster.filter(r => r !== record.lead);
    const rosterText = record.lead
        ? `Lead: <@${record.lead}>` +
          (helpers.length ? `\nHelpers: ${helpers.map(r => `<@${r}>`).join(", ")}` : "")
        : "Unclaimed — a Builder can click Claim below.";

    const fields = [
        { name: "Client", value: `<@${record.clientId}>`, inline: true },
        { name: "Status", value: record.status, inline: true },
        { name: "Past Builds", value: historyText, inline: false },
        { name: "Concept", value: i.concept || "N/A" },
        { name: "Reference Links", value: i.references || "None provided" },
        { name: "Timeframe", value: i.timeframe || "Not specified" },
        { name: "Anything Else", value: i.anythingElse || "Nothing added" },
        { name: "Roster", value: rosterText },
    ];

    // Each Extra Info entry becomes its own numbered field (SOP: #1, #2, ...)
    (record.extraInfo || []).forEach((entry, idx) => {
        fields.push({ name: `Extra Info #${idx + 1}`, value: entry });
    });

    return {
        title: `📋 Hire Case #${record.ticketId}`,
        color: 0x2ecc71,
        fields,
        timestamp: new Date().toISOString(),
    };
}

module.exports.buildCaseEmbed = buildCaseEmbed;

// ------------------------------------------------------------------
// Step 4 — claim a case (assign Lead) with the dual-write
// ------------------------------------------------------------------
async function claimCase(interaction, client, config) {
    // Which case is this? Resolve it from the channel we're in.
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) {
        return interaction.reply({
            content: "❌ This doesn't look like a valid hire case channel.",
            flags: 64,
        });
    }

    // Only Builders (or Senior Staff) may claim
    const member = interaction.member;
    const seniorIds = (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);
    const canClaim =
        (config.roles.builder && member.roles.cache.has(config.roles.builder)) ||
        seniorIds.some(id => member.roles.cache.has(id));

    if (!canClaim) {
        return interaction.reply({
            content: "❌ Only Builders can claim cases.",
            flags: 64,
        });
    }

    // Already claimed?
    if (record.lead) {
        return interaction.reply({
            content: `❌ This case is already claimed by <@${record.lead}>.`,
            flags: 64,
        });
    }

    // Acknowledge the click; we're about to edit the message it lives on
    await interaction.deferUpdate();

    // Update the record: this Builder becomes Lead and the first roster member
    const updated = store.updateCase(record.ticketId, {
        lead: interaction.user.id,
        roster: [interaction.user.id],
        status: "claimed",
    });

    // DUAL-WRITE: refresh the embed in BOTH the ticket and the forum post ...
    await updateCaseViews(interaction.guild, updated);
    // ... and remove the Claim button now that it's claimed
    await interaction.message.edit({ components: [] });

    // Plain-language announcement in the ticket (SOP: every stage announces)
    await interaction.channel.send(
        `✋ <@${interaction.user.id}> claimed this case as **Lead**.`
    );
}

// THE dual-write engine. Re-renders a case's embed and writes it to BOTH the
// ticket embed message AND the forum case-file post, so they always agree.
// Every stage (claim, roster, extra info, contract...) calls this.
async function updateCaseViews(guild, record) {
    const closed = store.getClosedCasesByClient(record.clientId);
    const historyText = closed.length
        ? closed.map(c => `#${c.ticketId}`).join(", ")
        : "First-time client (no past builds).";
    const embed = buildCaseEmbed(record, historyText);

    // 1) The embed message inside the ticket channel
    if (record.channelId && record.embedMessageId) {
        try {
            const channel = await guild.channels.fetch(record.channelId);
            const msg = await channel.messages.fetch(record.embedMessageId);
            await msg.edit({ embeds: [embed] });
        } catch (err) {
            console.error(`Failed to update ticket embed for case #${record.ticketId}:`, err);
        }
    }

    // 2) The starter message of the forum case-file post
    if (record.forumThreadId) {
        try {
            const thread = await guild.channels.fetch(record.forumThreadId);
            const starter = await thread.fetchStarterMessage();
            if (starter) await starter.edit({ embeds: [embed] });
        } catch (err) {
            console.error(`Failed to update forum post for case #${record.ticketId}:`, err);
        }
    }
}

module.exports.updateCaseViews = updateCaseViews;
