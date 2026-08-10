const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { closeCaseChannel, isLeadOrSenior } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("closecase")
        .setDescription("Manually close this hire case now (Lead or Senior) — e.g. a cancellation.")
        .addStringOption(o =>
            o.setName("reason").setDescription("Why it's being closed (e.g. cancelled)").setRequired(false)),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (!isLeadOrSenior(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only the case Lead or Senior Staff can close this case.", flags: 64 });
        }
        if (record.status === "closed") {
            return interaction.reply({ content: "❌ This case is already closed.", flags: 64 });
        }

        const reason = interaction.options.getString("reason") || "closed manually";

        await interaction.reply({
            content: `🔒 Closing this case (${reason}). Saving a transcript and deleting the channel shortly...`,
            flags: 64,
        });

        await closeCaseChannel(interaction.guild, record, interaction.user.id, reason, config);
    },
};
