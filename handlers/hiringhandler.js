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
    AttachmentBuilder,
} = require("discord.js");

const store = require("../hire/store");
const referrals = require("./referralhandler");
const archive = require("./archive");
const { renderEntry } = require("./extrainfohandler");

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

        // Builder drill: role-play client fills in the same hire form
        if (interaction.isButton() && interaction.customId === "hire_drill_intake") {
            return openDrillIntakeModal(interaction, config);
        }
        if (interaction.isModalSubmit() && interaction.customId === "hire_drill_intakemodal") {
            return submitDrillIntake(interaction, config);
        }

        // Clicked Claim -> assign Lead + update both the ticket and case file
        if (interaction.isButton() && interaction.customId === "hire_claim") {
            return claimCase(interaction, client, config);
        }

        // Client clicked one of the two Accept buttons on the contract.
        // Accepting also answers the template bank question (contract section 5).
        if (interaction.isButton() && interaction.customId === "hire_contract_accept_copy") {
            return acceptContract(interaction, client, config, "yes");
        }
        if (interaction.isButton() && interaction.customId === "hire_contract_accept_nocopy") {
            return acceptContract(interaction, client, config, "no");
        }

        // Client clicked Decline on the contract -> ask them why
        if (interaction.isButton() && interaction.customId === "hire_contract_decline") {
            return openDeclineModal(interaction);
        }

        // Lead confirming the client actually granted admin access
        if (interaction.isButton() && interaction.customId === "hire_admin_done") {
            return confirmAdminAccess(interaction, client, config);
        }

        // Optional voice channel for the build
        if (interaction.isButton() && interaction.customId === "hire_vc_yes") {
            return createTempVC(interaction, client, config);
        }
        if (interaction.isButton() && interaction.customId === "hire_vc_no") {
            return skipTempVC(interaction, client, config);
        }

        // Client submitted the decline reason
        if (interaction.isModalSubmit() && interaction.customId === "hire_contract_decline_modal") {
            return declineContract(interaction, client, config);
        }

        // Step 6 — client answers the rating Yes/No ping
        if (interaction.isButton() && interaction.customId === "hire_rating_yes") {
            return openRatingModal(interaction);
        }
        if (interaction.isButton() && interaction.customId === "hire_rating_no") {
            return skipRating(interaction, client, config);
        }
        if (interaction.isModalSubmit() && interaction.customId === "hire_rating_modal") {
            return saveRating(interaction, client, config);
        }

        // Step 8 — template bank: Lead decision, then client consent
        if (interaction.isButton() && interaction.customId === "hire_template_yes") {
            return templateLeadYes(interaction, client, config);
        }
        if (interaction.isButton() && interaction.customId === "hire_template_no") {
            return templateLeadNo(interaction, client, config);
        }
        if (interaction.isButton() && interaction.customId === "hire_consent_yes") {
            return templateClientYes(interaction, client, config);
        }
        if (interaction.isButton() && interaction.customId === "hire_consent_no") {
            return templateClientNo(interaction, client, config);
        }

        // Step 9 — final close confirmation
        if (interaction.isButton() && interaction.customId === "hire_close_yes") {
            return finalCloseYes(interaction, client, config);
        }
        if (interaction.isButton() && interaction.customId === "hire_close_no") {
            return openCloseNeedModal(interaction);
        }
        if (interaction.isModalSubmit() && interaction.customId === "hire_close_need_modal") {
            return closeNeedSubmitted(interaction, client, config);
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

    await interaction.showModal(buildIntakeModal("hiremodal", "Hire BSCH — Tell us about your build"));
}

// The hire intake form. Real hire tickets and builder drills use the same one.
function buildIntakeModal(customId, title) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

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

    return modal;
}

function readIntake(interaction) {
    return {
        concept: interaction.fields.getTextInputValue("concept"),
        references: interaction.fields.getTextInputValue("references"),
        timeframe: interaction.fields.getTextInputValue("timeframe"),
        anythingElse: interaction.fields.getTextInputValue("anythingElse"),
    };
}

// ------------------------------------------------------------------
// Builder drills — a practice hire case inside the drill channel.
// /drillstart makes the case; the role-play client fills in the hire form,
// then the bot posts the intake embed + Claim button like a real ticket.
// No case-log forum post, no claim timers, no transcript.
// ------------------------------------------------------------------
async function openDrillIntakeModal(interaction, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record || !record.drill) {
        return interaction.reply({ content: "❌ This isn't a builder drill channel.", flags: 64 });
    }
    if (interaction.user.id !== record.clientId && !isSenior(interaction.member, config)) {
        return interaction.reply({ content: "❌ Only the role-play client fills in the hire form.", flags: 64 });
    }
    if (record.embedMessageId) {
        return interaction.reply({ content: "❌ The hire form for this drill is already filled in.", flags: 64 });
    }
    await interaction.showModal(buildIntakeModal("hire_drill_intakemodal", "Drill — Tell us about your build"));
}

async function submitDrillIntake(interaction, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record || !record.drill) {
        return interaction.reply({ content: "❌ This isn't a builder drill channel.", flags: 64 });
    }
    if (record.embedMessageId) {
        return interaction.reply({ content: "❌ The hire form for this drill is already filled in.", flags: 64 });
    }

    const updated = store.updateCase(record.ticketId, { intake: readIntake(interaction) });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("hire_claim")
            .setLabel("✋ Claim Case")
            .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ content: "📝 Hire form received." });
    const embedMessage = await interaction.channel.send({
        content: `<@${record.traineeId}>`,
        embeds: [buildCaseEmbed(updated, DRILL_HISTORY)],
        components: [row],
    });
    store.updateCase(record.ticketId, { embedMessageId: embedMessage.id });

    // Take the "fill in the form" button off the drill intro message
    if (record.intakePromptMessageId) {
        const prompt = await interaction.channel.messages.fetch(record.intakePromptMessageId).catch(() => null);
        if (prompt) await prompt.edit({ components: [] }).catch(() => {});
    }
}

const DRILL_HISTORY = "Training drill (not a real client).";

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
        intake: readIntake(interaction),
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

    // 7) Ask a first-time client how they found us (once per person)
    await referrals.askIfNew(channel, user.id, "hire");

    // 8) Save the channel + forum + embed-message ids back onto the case
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

    // Contract status (SOP Step 4): pending / accepted / declined
    if (record.contract) {
        let contractText;
        if (record.contract.acceptedAt) {
            contractText = `✅ Accepted <t:${Math.floor(new Date(record.contract.acceptedAt).getTime() / 1000)}:R>`;
        } else if (record.contract.declinedAt) {
            contractText = `❌ Declined <t:${Math.floor(new Date(record.contract.declinedAt).getTime() / 1000)}:R>` +
                (record.contract.declineReason ? `\nReason: ${record.contract.declineReason}` : "");
        } else {
            contractText = "📨 Sent — waiting on the client.";
        }
        fields.push({ name: "Contract", value: contractText });
    }

    // Step 5 — server access granted / build started
    if (record.adminGrantedAt) {
        const ts = Math.floor(new Date(record.adminGrantedAt).getTime() / 1000);
        fields.push({ name: "Server Access", value: `🔑 Admin granted, build started <t:${ts}:R>` });
    }

    // Step 6 — build finished + client rating/review
    if (record.buildFinishedAt) {
        const ts = Math.floor(new Date(record.buildFinishedAt).getTime() / 1000);
        fields.push({ name: "Build Finished", value: `🏁 <t:${ts}:R>` });
    }
    if (record.rating) {
        const r = record.rating;
        const val = r.declined
            ? "Client declined to leave a rating."
            : `⭐ ${r.score}/10` + (r.review ? `\n"${r.review}"` : "");
        fields.push({ name: "Client Rating", value: val });
    }

    // Step 7 — paperwork
    if (record.paperwork) {
        const p = record.paperwork;
        let pw = `Server name: ${p.serverName || "N/A"}`;
        if (p.notes) pw += `\nNotes: ${p.notes}`;
        if (p.images && p.images.length) pw += `\nImages: ${p.images.length} attached`;
        fields.push({ name: "Paperwork", value: pw });
    }

    // Step 8 — template bank decision chain
    if (record.templateBank) {
        const t = record.templateBank;
        let tb;
        if (t.copiedConfirmed) tb = "✅ Copied into the template bank (Lead + client agreed).";
        else if (t.clientConsent === "no") tb = "Client said no on the contract — will not be copied.";
        else if (t.leadDecision === "no") tb = "Lead declined — not added to the template bank.";
        else if (t.leadDecision === "yes" && t.clientConsent === "yes") tb = "Lead + client agreed — awaiting copy by a Builder.";
        else if (t.clientConsent === "yes") tb = "Client agreed on the contract — Lead decides after paperwork.";
        else tb = "Awaiting decision.";
        fields.push({ name: "Template Bank", value: tb });
    }

    // Each Extra Info entry becomes its own numbered field (SOP: #1, #2, ...).
    // Numbers never shift: a removed entry stays, struck through.
    (record.extraInfo || []).forEach((entry, idx) => {
        fields.push({ name: `Extra Info #${idx + 1}`, value: renderEntry(entry) });
    });

    return {
        title: record.drill ? `🎯 Drill Case #${record.ticketId}` : `📋 Hire Case #${record.ticketId}`,
        color: record.drill ? 0xf1c40f : 0x2ecc71,
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

    // Only Builders (or Senior Staff, or the trainee in a drill) may claim
    if (!isCaseBuilder(interaction.member, record, config)) {
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
    const historyText = record.drill
        ? DRILL_HISTORY
        : closed.length
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

// ------------------------------------------------------------------
// Step 6 — contract Accept / Decline
// (The /contract command itself lives in commands/contract.js. It sends the
//  embed + these buttons and snapshots the contract text onto the case.)
// ------------------------------------------------------------------

// Client clicked one of the Accept buttons. copyConsent is "yes" or "no".
async function acceptContract(interaction, client, config, copyConsent) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) {
        return interaction.reply({ content: "❌ This isn't a valid hire case channel.", flags: 64 });
    }

    // Only the client this case belongs to may accept
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can accept the contract.", flags: 64 });
    }

    if (!record.contract) {
        return interaction.reply({ content: "❌ No contract has been sent yet.", flags: 64 });
    }
    if (record.contract.acceptedAt) {
        return interaction.reply({ content: "❌ You've already accepted this contract.", flags: 64 });
    }

    await interaction.deferUpdate();

    const updated = store.updateCase(record.ticketId, {
        status: "contract-accepted",
        contract: { ...record.contract, acceptedAt: new Date().toISOString(), declinedAt: null, declineReason: null },
        templateBank: { ...(record.templateBank || {}), clientConsent: copyConsent, consentGivenAt: new Date().toISOString() },
    });

    await updateCaseViews(interaction.guild, updated);
    // Lock the buttons now that a decision is made
    await interaction.message.edit({ components: [] });

    await interaction.channel.send(
        `✅ <@${interaction.user.id}> **accepted** the contract. The build can begin.\n` +
        (copyConsent === "yes"
            ? "🗃️ They agreed we may save a copy of the build to the template bank."
            : "🗃️ They asked us **not** to reuse their build, so it won't be copied.")
    );

    await promptTempVC(interaction.channel, updated);
}

// ------------------------------------------------------------------
// Step 5 — the Lead confirms access, which starts the build
// (/admingrant posts the instructions and this button.)
// ------------------------------------------------------------------
async function confirmAdminAccess(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });

    if (!isCaseBuilder(interaction.member, record, config)) {
        return interaction.reply({ content: "❌ Only Builders on the case can confirm access.", flags: 64 });
    }
    if (record.adminGrantedAt) {
        return interaction.reply({ content: "❌ Server access is already logged as granted.", flags: 64 });
    }

    await interaction.deferUpdate();
    await interaction.message.edit({ components: [] }).catch(() => {});

    const now = new Date().toISOString();
    const updated = store.updateCase(record.ticketId, {
        adminGrantedAt: now,
        buildStartedAt: now,
        status: "build-started",
    });
    await updateCaseViews(interaction.guild, updated);

    await interaction.channel.send(
        `🔑 <@${interaction.user.id}> confirmed access. The build is now **started**. Good luck!`
    );
}

// ------------------------------------------------------------------
// Optional voice channel for the build, sitting under the ticket
// ------------------------------------------------------------------
async function promptTempVC(channel, record) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hire_vc_yes").setLabel("🎙️ Yes, add a voice channel").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hire_vc_no").setLabel("No thanks").setStyle(ButtonStyle.Secondary),
    );
    await channel.send({
        content: `<@${record.clientId}>${record.lead ? ` <@${record.lead}>` : ""}`,
        embeds: [{
            title: "🎙️ Want a voice channel?",
            color: 0x3498db,
            description: "Some builds go quicker on voice. I can add a private voice channel under this ticket for the people on this case. It disappears when the ticket closes.",
        }],
        components: [row],
    });
}

async function createTempVC(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });

    const allowed = interaction.user.id === record.clientId || isLeadOrSenior(interaction.member, record, config);
    if (!allowed) return interaction.reply({ content: "❌ Only the client or the Lead can answer this.", flags: 64 });

    if (record.voiceChannelId) {
        return interaction.reply({ content: `❌ This case already has a voice channel: <#${record.voiceChannelId}>.`, flags: 64 });
    }

    await interaction.deferUpdate();
    await interaction.message.edit({ components: [] }).catch(() => {});

    const ticket = interaction.channel;
    const vc = await interaction.guild.channels.create({
        name: `hire-vc-${record.ticketId}`,
        type: ChannelType.GuildVoice,
        parent: ticket.parentId || undefined,
        position: ticket.rawPosition + 1,
        permissionOverwrites: ticket.permissionOverwrites.cache.map(o => ({
            id: o.id, type: o.type, allow: o.allow, deny: o.deny,
        })),
    }).catch(err => { console.error("Could not create the case voice channel:", err.message); return null; });

    if (!vc) {
        return interaction.channel.send("⚠️ I couldn't make the voice channel. Check that I have **Manage Channels**.");
    }

    store.updateCase(record.ticketId, { voiceChannelId: vc.id });
    await interaction.channel.send(`🎙️ Voice channel ready: ${vc}. It's deleted when this case closes.`);
}

async function skipTempVC(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    const allowed = interaction.user.id === record.clientId || isLeadOrSenior(interaction.member, record, config);
    if (!allowed) return interaction.reply({ content: "❌ Only the client or the Lead can answer this.", flags: 64 });

    await interaction.deferUpdate();
    await interaction.message.edit({ components: [] }).catch(() => {});
    await interaction.channel.send("👍 No voice channel. The Lead can still add one later by asking Senior Staff.");
}

// Client clicked "Decline" -> pop a short reason modal
async function openDeclineModal(interaction) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) {
        return interaction.reply({ content: "❌ This isn't a valid hire case channel.", flags: 64 });
    }
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can decline the contract.", flags: 64 });
    }

    const modal = new ModalBuilder()
        .setCustomId("hire_contract_decline_modal")
        .setTitle("Decline the contract");

    const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Why are you declining? (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reason));
    await interaction.showModal(modal);
}

// Client submitted the decline reason
async function declineContract(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) {
        return interaction.reply({ content: "❌ This isn't a valid hire case channel.", flags: 64 });
    }
    if (!record.contract) {
        return interaction.reply({ content: "❌ No contract has been sent yet.", flags: 64 });
    }

    const reason = interaction.fields.getTextInputValue("reason") || "No reason given.";

    const updated = store.updateCase(record.ticketId, {
        status: "contract-declined",
        contract: { ...record.contract, declinedAt: new Date().toISOString(), declineReason: reason, acceptedAt: null },
    });

    await updateCaseViews(interaction.guild, updated);

    await interaction.reply({
        content: `❌ <@${interaction.user.id}> **declined** the contract.\n**Reason:** ${reason}\n🔒 This case is now closed.` + (record.drill ? "" : " The ticket will be deleted in a moment."),
    });

    // SOP Step 4: a declined case does not proceed, so close the ticket
    await closeCaseChannel(interaction.guild, updated, interaction.user.id, "contract-declined", config);
}

module.exports.updateCaseViews = updateCaseViews;

// ==================================================================
// Shared permission helpers
// ==================================================================
function seniorIdsOf(config) {
    return (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);
}
function isSenior(member, config) {
    return seniorIdsOf(config).some(id => member.roles.cache.has(id));
}
function isLeadOrSenior(member, record, config) {
    return member.id === record.lead || isSenior(member, config);
}
// Builders and Senior Staff can work any case. In a builder drill the trainee
// doesn't have the Builder role yet, so they count as a Builder for that case.
function isCaseBuilder(member, record, config) {
    if (config.roles.builder && member.roles.cache.has(config.roles.builder)) return true;
    if (record && record.drill && member.id === record.traineeId) return true;
    return isSenior(member, config);
}

// ==================================================================
// Step 6 — Build Finished & Rating
// (/buildfinished command marks the build done and calls promptRating.)
// ==================================================================

// Sent by /buildfinished: ask the client if they want to leave a rating.
async function promptRating(channel, record) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hire_rating_yes").setLabel("⭐ Yes, leave a rating").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hire_rating_no").setLabel("No thanks").setStyle(ButtonStyle.Secondary),
    );
    await channel.send({
        content: `<@${record.clientId}>`,
        embeds: [{
            title: "🏁 Build Finished!",
            color: 0x2ecc71,
            description: "Your build is complete! Would you like to leave a rating and/or a short review? It's completely optional.",
        }],
        components: [row],
    });
}

// Client clicked "Yes" -> show the rating form
async function openRatingModal(interaction) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can leave the rating.", flags: 64 });
    }

    const modal = new ModalBuilder().setCustomId("hire_rating_modal").setTitle("Rate your build");
    const score = new TextInputBuilder()
        .setCustomId("score").setLabel("Rating (a number from 1 to 10)")
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2);
    const review = new TextInputBuilder()
        .setCustomId("review").setLabel("Review (optional)")
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
    modal.addComponents(
        new ActionRowBuilder().addComponents(score),
        new ActionRowBuilder().addComponents(review),
    );
    await interaction.showModal(modal);
}

// Client submitted the rating form
async function saveRating(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });

    const raw = interaction.fields.getTextInputValue("score");
    const score = parseInt(raw, 10);
    if (isNaN(score) || score < 1 || score > 10) {
        return interaction.reply({ content: "❌ The rating must be a whole number from 1 to 10. Please click the button again.", flags: 64 });
    }
    const review = interaction.fields.getTextInputValue("review") || "";

    const updated = store.updateCase(record.ticketId, {
        rating: { score, review, respondedAt: new Date().toISOString(), declined: false },
    });
    await updateCaseViews(interaction.guild, updated);

    await interaction.reply({
        content: `⭐ <@${interaction.user.id}> rated this build **${score}/10**.` +
            (review ? `\n> ${review}` : "") +
            `\n\nThe Lead can now file \`/paperwork\` to wrap up.`,
    });
}

// Client clicked "No thanks"
async function skipRating(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can answer this.", flags: 64 });
    }

    await interaction.deferUpdate();
    const updated = store.updateCase(record.ticketId, {
        rating: { declined: true, respondedAt: new Date().toISOString() },
    });
    await updateCaseViews(interaction.guild, updated);
    await interaction.message.edit({ components: [] });
    await interaction.channel.send("👍 No rating left. The Lead can now file `/paperwork` to wrap up.");
}

// ==================================================================
// Step 8 — Template Bank Consideration
// (Triggered at the end of /paperwork via promptTemplateBank.)
// ==================================================================

// Ask the Lead whether this build is worth keeping in the template bank.
async function promptTemplateBank(channel, record, config) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hire_template_yes").setLabel("Yes, keep it").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hire_template_no").setLabel("No, skip").setStyle(ButtonStyle.Secondary),
    );
    const leadMention = record.lead ? `<@${record.lead}>` : "Lead";
    await channel.send({
        content: leadMention,
        embeds: [{
            title: "🗃️ Template Bank",
            color: 0x9b59b6,
            description: "Is this build worth preserving in BSCH's reusable template bank for future projects?",
        }],
        components: [row],
    });
}

// Lead said YES -> record it, then ask the client for consent
async function templateLeadYes(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (!isLeadOrSenior(interaction.member, record, config)) {
        return interaction.reply({ content: "❌ Only the Lead can make this call.", flags: 64 });
    }

    await interaction.deferUpdate();
    const updated = store.updateCase(record.ticketId, {
        templateBank: { ...(record.templateBank || {}), leadDecision: "yes" },
    });
    await updateCaseViews(interaction.guild, updated);
    await interaction.message.edit({ components: [] });

    // The client already answered this when they accepted the contract
    if (updated.templateBank.clientConsent === "yes") {
        return sendCopyPing(interaction.channel, updated, config);
    }
    if (updated.templateBank.clientConsent === "no") {
        return interaction.channel.send(
            "🗃️ The client asked us not to reuse their build when they accepted the contract, so nothing is copied. " +
            "The Lead can run `/copyphasedone` to move to closing."
        );
    }

    // No answer on file (a case from before the contract asked): ask them now
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hire_consent_yes").setLabel("Yes, you may reuse it").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hire_consent_no").setLabel("No, please don't").setStyle(ButtonStyle.Secondary),
    );
    await interaction.channel.send({
        content: `<@${record.clientId}>`,
        embeds: [{
            title: "🗃️ May we reuse your design?",
            color: 0x9b59b6,
            description:
                "Our Lead thinks your build turned out great! With your permission, BSCH would love to keep a copy of your server's layout in our **template bank** " +
                "so parts of it can inspire and speed up future builds for other clients. Your server stays yours — this only affects whether we can reuse the design. Is that okay?",
        }],
        components: [row],
    });
}

// Lead said NO -> skip the copy entirely
async function templateLeadNo(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (!isLeadOrSenior(interaction.member, record, config)) {
        return interaction.reply({ content: "❌ Only the Lead can make this call.", flags: 64 });
    }
    await interaction.deferUpdate();
    const updated = store.updateCase(record.ticketId, {
        templateBank: { ...(record.templateBank || {}), leadDecision: "no" },
    });
    await updateCaseViews(interaction.guild, updated);
    await interaction.message.edit({ components: [] });
    await interaction.channel.send("🗃️ Not added to the template bank. The Lead can run `/copyphasedone` to move to closing.");
}

// Client consented -> ping a Builder to run /copyserver
async function templateClientYes(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can answer this.", flags: 64 });
    }
    await interaction.deferUpdate();
    const updated = store.updateCase(record.ticketId, {
        templateBank: { ...(record.templateBank || {}), clientConsent: "yes" },
    });
    await updateCaseViews(interaction.guild, updated);
    await interaction.message.edit({ components: [] });

    await sendCopyPing(interaction.channel, updated, config);
}

// Ask a Builder to run /copyserver in the client's server.
async function sendCopyPing(channel, record, config) {
    // In a drill, the trainee does the copy step; don't ping the real Builders
    const builderMention = record.drill
        ? `<@${record.traineeId}>`
        : config.roles.builder ? `<@&${config.roles.builder}>` : "Builders";
    await channel.send(
        `✅ The client agreed! ${builderMention} — please run \`/copyserver\` **inside the client's server** to save the layout into the template bank, ` +
        `then come back here and run \`/copyphasedone\`.`
    );
}

// Client declined -> skip the copy
async function templateClientNo(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can answer this.", flags: 64 });
    }
    await interaction.deferUpdate();
    const updated = store.updateCase(record.ticketId, {
        templateBank: { ...(record.templateBank || {}), clientConsent: "no" },
    });
    await updateCaseViews(interaction.guild, updated);
    await interaction.message.edit({ components: [] });
    await interaction.channel.send("👍 No problem — we won't reuse your design. The Lead can run `/copyphasedone` to move to closing.");
}

// ==================================================================
// Step 9 — Close
// (/copyphasedone calls sendFinalCloseEmbed.)
// ==================================================================

// The final message to the client with the close confirmation buttons.
async function sendFinalCloseEmbed(channel, record, config) {
    const donation = config.links && config.links.donationLink
        ? `\n\n💛 BSCH is free, but if you'd like to support us, donations are welcome (never required): ${config.links.donationLink}`
        : "";
    const helpDesk = config.channels && config.channels.helpDesk
        ? `\n\n❓ Need anything later? Open a ticket in <#${config.channels.helpDesk}>.`
        : "";

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hire_close_yes").setLabel("✅ Yes, close the ticket").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hire_close_no").setLabel("Not yet").setStyle(ButtonStyle.Secondary),
    );

    await channel.send({
        content: `<@${record.clientId}>`,
        embeds: [{
            title: "🎉 All Done!",
            color: 0x2ecc71,
            description:
                "Thank you for building with BSCH! A couple of last things:\n\n" +
                "🔑 Please **revoke BSCH's admin access** from your server now that the build is finished." +
                helpDesk + donation +
                "\n\nIs it clear to close this ticket?",
        }],
        components: [row],
    });
}

// Client (or staff) clicked "Yes, close"
async function finalCloseYes(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });

    const allowed = interaction.user.id === record.clientId || isSenior(interaction.member, config) || interaction.user.id === record.lead;
    if (!allowed) {
        return interaction.reply({ content: "❌ Only the client or case staff can close the ticket.", flags: 64 });
    }

    await interaction.deferUpdate();
    await interaction.message.edit({ components: [] }).catch(() => {});
    await interaction.channel.send("🔒 Closing the ticket and saving the final record. Thank you!");
    await closeCaseChannel(interaction.guild, record, interaction.user.id, "completed", config);
}

// Client clicked "Not yet" -> ask what they still need
async function openCloseNeedModal(interaction) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    if (interaction.user.id !== record.clientId) {
        return interaction.reply({ content: "❌ Only the client can answer this.", flags: 64 });
    }
    const modal = new ModalBuilder().setCustomId("hire_close_need_modal").setTitle("Before we close...");
    const need = new TextInputBuilder()
        .setCustomId("need").setLabel("What do you still need?")
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
    modal.addComponents(new ActionRowBuilder().addComponents(need));
    await interaction.showModal(modal);
}

// Client submitted what they still need -> keep ticket open, ping staff
async function closeNeedSubmitted(interaction, client, config) {
    const record = store.getCaseByChannel(interaction.channel.id);
    if (!record) return interaction.reply({ content: "❌ Not a valid hire case channel.", flags: 64 });
    const need = interaction.fields.getTextInputValue("need");
    const leadMention = record.lead ? `<@${record.lead}>` : "the Lead";
    await interaction.reply({
        content: `📌 The ticket will stay open. ${leadMention}, the client still needs:\n> ${need}`,
    });
}

// ==================================================================
// Shared close engine — transcript + mark closed + delete the channel.
// Used by the final close button, /closecase, and the 48h claim timer.
// ==================================================================
async function closeCaseChannel(guild, record, closedById, reason, config) {
    // Mark closed first so the forum post shows the final state.
    const updated = store.updateCase(record.ticketId, {
        status: "closed",
        closedAt: new Date().toISOString(),
        closedBy: closedById || null,
        closeReason: reason || "closed",
    });
    await updateCaseViews(guild, updated);

    // The case's voice channel goes away with the case, drills included
    await deleteCaseVoice(guild, record);

    // Drill cases: keep the channel so the Head can grade it with /drillend
    if (record.drill) {
        const ch = await guild.channels.fetch(record.channelId).catch(() => null);
        if (ch) {
            await ch.send(`🎯 The practice case is finished (${reason || "closed"}). <@${record.headId}>, grade it with \`/drillend\`.`).catch(() => {});
        }
        return updated;
    }

    let channel = null;
    try {
        channel = record.channelId ? await guild.channels.fetch(record.channelId) : null;
    } catch { channel = null; }

    let transcriptText = `Case #${record.ticketId} closed (${reason || "closed"}). No live channel to transcribe.`;
    let messageCount = 0;

    if (channel) {
        const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (fetched) {
            const ordered = [...fetched.values()].reverse();
            messageCount = ordered.length;
            const lines = ordered.map(m => {
                const time = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
                let text = m.content || "";
                if (m.embeds.length) text += ` [embed: ${m.embeds[0].title || "no title"}]`;
                if (m.attachments.size) text += ` [${m.attachments.size} attachment(s)]`;
                return `[${time}] ${m.author.tag}: ${text}`;
            });
            transcriptText =
                `Transcript for hire case #${record.ticketId} (#${channel.name})\n` +
                `Client: ${record.clientId}\n` +
                `Closed (${reason || "closed"}) by ${closedById || "system"} on ${new Date().toISOString()}\n` +
                `Messages: ${messageCount}\n` +
                `----------------------------------------\n\n` +
                lines.join("\n");
        }
    }

    const makeFile = () => new AttachmentBuilder(Buffer.from(transcriptText, "utf-8"), { name: `transcript-case-${record.ticketId}.txt` });

    // Post to the transcripts channel
    if (config && config.channels && config.channels.transcriptsChannel) {
        const tc = guild.channels.cache.get(config.channels.transcriptsChannel);
        if (tc) {
            await tc.send({
                embeds: [{
                    title: `📜 Hire Case Transcript — #${record.ticketId}`,
                    color: 0x992d22,
                    fields: [
                        { name: "Client", value: `<@${record.clientId}>`, inline: true },
                        { name: "Reason", value: reason || "closed", inline: true },
                        { name: "Messages", value: String(messageCount), inline: true },
                    ],
                    timestamp: new Date().toISOString(),
                }],
                files: [makeFile()],
            }).catch(() => {});
        }
    }

    // Attach transcript to the permanent forum case file too
    if (record.forumThreadId) {
        try {
            const thread = await guild.channels.fetch(record.forumThreadId);
            await thread.send({ content: "🔒 Case closed. Full transcript attached.", files: [makeFile()] });
        } catch (err) {
            console.error(`Failed to attach transcript to forum for case #${record.ticketId}:`, err);
        }
    }

    // Closed cases go to the archive category, not straight to the bin
    if (channel) {
        await archive.archiveChannel(guild, channel, config, closedById);
    }
    return updated;
}

module.exports.promptRating = promptRating;
module.exports.promptTemplateBank = promptTemplateBank;
module.exports.sendFinalCloseEmbed = sendFinalCloseEmbed;
module.exports.closeCaseChannel = closeCaseChannel;
module.exports.isSenior = isSenior;
module.exports.isLeadOrSenior = isLeadOrSenior;
module.exports.isCaseBuilder = isCaseBuilder;

// Remove a case's voice channel, if it asked for one. Safe to call twice.
async function deleteCaseVoice(guild, record) {
    if (!record || !record.voiceChannelId) return;
    const vc = await guild.channels.fetch(record.voiceChannelId).catch(() => null);
    if (vc) await vc.delete("Hire case closed").catch(() => {});
    store.updateCase(record.ticketId, { voiceChannelId: null });
}
module.exports.deleteCaseVoice = deleteCaseVoice;

// /copyserver and /pasteserver run inside a CLIENT's server, where nobody has
// BSCH roles. Look the user up in the main BSCH server instead. A trainee with
// an open builder drill also counts, so they can do the drill's copy step.
async function isMainServerBuilder(client, userId, config) {
    const main = client.guilds.cache.get(config.guildId);
    const member = main ? await main.members.fetch(userId).catch(() => null) : null;
    if (member && isCaseBuilder(member, null, config)) return true;
    return store.getAllCases().some(c => c.drill && c.status !== "closed" && c.traineeId === userId);
}
module.exports.isMainServerBuilder = isMainServerBuilder;
