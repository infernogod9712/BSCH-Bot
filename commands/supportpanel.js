const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = { 
    data: new SlashCommandBuilder()
        .setName("supportpanel")
        .setDescription("Send the ticket panel in this channel")
        .setDefaultMemberPermissions(0),
    
    async execute(interaction, client, config) {
        await interaction.deferReply({ flags: 64 });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_support")
                .setLabel("🎫 General Support")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("ticket_help")
                .setLabel("🆘 Server Building Advice")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("ticket_bug")
                .setLabel("🪳 Bug Report")
                .setStyle(ButtonStyle.Primary)
        );

        const channel = client.channels.cache.get(config.channels.helpDesk);
        if (!channel) {
            return interaction.editReply({
                content: "❌ Ticket Channel not found. Please contact a member of Ownership."
            });
        }

        await channel.send({
            embeds: [
                {
                    title: "🆘 Support Ticket System",
                    description: "Hello and welcome to the BSCH support system, please select the ticket type that suits your needs the best :)",
                    color: 0x3498db
                }
            ],
            components: [row]
        });

        return interaction.editReply({
            content: "✅ Support panel sent."
        });
    }
};
