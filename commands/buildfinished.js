const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, promptRating, isLeadOrSenior } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("buildfinished")
        .setDescription("Mark the build complete and ask the client for a rating (Lead)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (!isLeadOrSenior(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only the case Lead can mark the build finished.", flags: 64 });
        }
        if (record.buildFinishedAt) {
            return interaction.reply({ content: "❌ This build is already marked finished.", flags: 64 });
        }

        const updated = store.updateCase(record.ticketId, {
            buildFinishedAt: new Date().toISOString(),
            status: "build-finished",
        });
        await updateCaseViews(interaction.guild, updated);

        // Ephemeral ack, then the public rating ping to the client
        await interaction.reply({ content: "🏁 Build marked finished. Asking the client for a rating...", flags: 64 });
        await promptRating(interaction.channel, updated);
    },
};
