const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require("discord.js");

// The three support ticket types.
//  name  = shown to users (embed title, "Type" field)
//  slug  = used in the channel name  ->  {slug}-{client}
const TICKET_TYPES = {
    ticket_support: { name: "General Support", slug: "general" },
    ticket_help:    { name: "Server Building Advice", slug: "buildhelp" },
    ticket_bug:     { name: "Bug Report", slug: "bugreport" }
};

module.exports = {
    async handle(interaction, client, config) {
        // 1) Clicked a ticket-type button -> pop up a modal asking what they need
        if (interaction.isButton() && TICKET_TYPES[interaction.customId]) {
            return openTicketModal(interaction);
        }

        // 2) Submitted that modal -> actually create the ticket channel
        if (interaction.isModalSubmit() && interaction.customId.startsWith("supportmodal:")) {
            return createTicket(interaction, config);
        }

        // 3) Clicked Close -> save a transcript, then delete the channel
        if (interaction.isButton() && interaction.customId === "ticket_close") {
            return closeTicket(interaction, config);
        }
    }
};

// ------------------------------------------------------------------
// Step 1 — show the modal
// ------------------------------------------------------------------
async function openTicketModal(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;

    // Block a second ticket before we even show the form
    const existing = guild.channels.cache.find(c => c.topic === `Ticket for ${user.id}`);
    if (existing) {
        return interaction.reply({
            content: `❌ You already have an open ticket: ${existing}.`,
            flags: 64
        });
    }

    const type = TICKET_TYPES[interaction.customId];

    const modal = new ModalBuilder()
        // remember which button opened this, so we know the type on submit
        .setCustomId(`supportmodal:${interaction.customId}`)
        .setTitle(`${type.name} Ticket`);

    const issueInput = new TextInputBuilder()
        .setCustomId("issue")
        .setLabel("What do you need help with?")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Describe your question or issue in as much detail as you can.")
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(issueInput));

    await interaction.showModal(modal);
}

// ------------------------------------------------------------------
// Step 2 — create the ticket channel using the modal answer
// ------------------------------------------------------------------
async function createTicket(interaction, config) {
    await interaction.deferReply({ flags: 64 });

    const guild = interaction.guild;
    const user = interaction.user;

    // customId looks like "supportmodal:ticket_support" -> grab the button id
    const buttonId = interaction.customId.split(":")[1];
    const type = TICKET_TYPES[buttonId];
    const issue = interaction.fields.getTextInputValue("issue");

    // Safety net: re-check for a duplicate (in case one opened between steps)
    const existing = guild.channels.cache.find(c => c.topic === `Ticket for ${user.id}`);
    if (existing) {
        return interaction.editReply({
            content: `❌ You already have an open ticket: ${existing}.`
        });
    }

    const channel = await guild.channels.create({
        name: `${type.slug}-${user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, ""),
        type: 0, // GuildText
        parent: config.categories.supportTickets,
        topic: `Ticket for ${user.id}`,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            ...config.staffRoles.map(roleId => ({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            }))
        ]
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("🔒 Close Ticket")
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `<@${user.id}>`,
        embeds: [
            {
                title: `🎫 ${type.name}`,
                description: "Thanks for reaching out! A staff member will be with you shortly. Here's what you told us:",
                color: 0x3498db,
                fields: [
                    { name: "User", value: `<@${user.id}>`, inline: true },
                    { name: "Type", value: type.name, inline: true },
                    { name: "Details", value: issue }
                ],
                timestamp: new Date().toISOString()
            }
        ],
        components: [row]
    });

    return interaction.editReply({
        content: `✅ Your ticket has been created: ${channel}.`
    });
}

// ------------------------------------------------------------------
// Step 3 — save a transcript, then delete the channel
// ------------------------------------------------------------------
async function closeTicket(interaction, config) {
    await interaction.deferReply({ flags: 64 });

    const channel = interaction.channel;

    // Pull the messages (newest first) and flip to chronological order
    const fetched = await channel.messages.fetch({ limit: 100 });
    const ordered = [...fetched.values()].reverse();

    const lines = ordered.map(m => {
        const time = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
        let text = m.content || "";
        if (m.embeds.length) text += ` [embed: ${m.embeds[0].title || "no title"}]`;
        if (m.attachments.size) text += ` [${m.attachments.size} attachment(s)]`;
        return `[${time}] ${m.author.tag}: ${text}`;
    });

    const transcriptText =
        `Transcript for #${channel.name}\n` +
        `Closed by ${interaction.user.tag} on ${new Date().toISOString()}\n` +
        `Messages: ${ordered.length}\n` +
        `----------------------------------------\n\n` +
        lines.join("\n");

    const file = new AttachmentBuilder(
        Buffer.from(transcriptText, "utf-8"),
        { name: `transcript-${channel.name}.txt` }
    );

    // Post it to the transcripts channel (if one is configured)
    const transcriptsChannel = interaction.guild.channels.cache.get(config.channels.transcriptsChannel);
    if (transcriptsChannel) {
        await transcriptsChannel.send({
            embeds: [
                {
                    title: `📜 Ticket Transcript — ${channel.name}`,
                    color: 0x992d22,
                    fields: [
                        { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Messages", value: String(ordered.length), inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }
            ],
            files: [file]
        });
    }

    await interaction.editReply({
        content: "🔒 Ticket closed. Transcript saved. Deleting channel in a moment..."
    });

    setTimeout(() => channel.delete().catch(() => {}), 3000);
}
