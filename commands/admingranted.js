const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, isSenior, isCaseBuilder } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("admingranted")
        .setDescription("Confirm the client granted server access — also marks the build as started (Builder)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (!isCaseBuilder(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only Builders on the case can confirm this.", flags: 64 });
        }
        if (record.adminGrantedAt) {
            return interaction.reply({ content: "❌ Server access is already logged as granted.", flags: 64 });
        }

        const now = new Date().toISOString();
        const updated = store.updateCase(record.ticketId, {
            adminGrantedAt: now,
            buildStartedAt: now,
            status: "build-started",
        });
        await updateCaseViews(interaction.guild, updated);

        return interaction.reply({
            content: `🔑 Server access confirmed and the build is now **started**. Good luck!`,
        });
    },
};
