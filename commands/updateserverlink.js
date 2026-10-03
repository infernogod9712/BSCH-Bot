const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { recordInvite, isLeadOrSenior } = require("../handlers/hiringhandler");

// Sets or replaces the client's server invite on a hire case, for when the
// first link expired or the client just pastes one into chat. Same checks as
// the "Add my server invite" button.

module.exports = {
    data: new SlashCommandBuilder()
        .setName("updateserverlink")
        .setDescription("Set or replace the client's server invite on this hire case.")
        .addStringOption(o =>
            o.setName("link")
                .setDescription("The invite, like discord.gg/abc123")
                .setRequired(true)
                .setMaxLength(120)
        ),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (record.status === "closed") {
            return interaction.reply({ content: "❌ This case is closed.", flags: 64 });
        }
        if (interaction.user.id !== record.clientId && !isLeadOrSenior(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only the client, the Lead or Senior Staff can change the server link.", flags: 64 });
        }

        return recordInvite(interaction, record, interaction.options.getString("link"), "Run the command again with the right link.");
    },
};
