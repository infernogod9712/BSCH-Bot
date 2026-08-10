const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = { 
    data: new SlashCommandBuilder()
        .setName("hirepanel")
        .setDescription("Send the ticket panel in this channel")
        .setDefaultMemberPermissions(0),
    
    async execute(interaction, client, config) {
        await interaction.deferReply({ flags: 64 });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_hire")
                .setLabel("🎫 Hire Us!")
                .setStyle(ButtonStyle.Primary),
        );

        const channel = client.channels.cache.get(config.channels.hireUs);
        if (!channel) {
            return interaction.editReply({
                content: "❌ Ticket Channel not found. Please contact a member of Ownership."
            });
        }

        await channel.send({
            embeds: [
                {
                    title: "🔨 Hire Ticket System",
                    description: "Hello and welcome to the BSCH Hiring system, please select the ticket type that suits your needs the best :)",
                    color: 0x3498db
                }
            ],
            components: [row]
        });

        return interaction.editReply({
            content: "✅ Hire panel sent."
        });
    }
};
