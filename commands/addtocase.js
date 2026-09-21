const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, isCaseBuilder } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("addtocase")
        .setDescription("Add yourself to this hire case's roster (Builders)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }

        if (!isCaseBuilder(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only Builders can join a case.", flags: 64 });
        }

        if (record.roster.includes(interaction.user.id)) {
            return interaction.reply({ content: "❌ You're already on this case.", flags: 64 });
        }

        const updated = store.updateCase(record.ticketId, {
            roster: [...record.roster, interaction.user.id],
        });

        await updateCaseViews(interaction.guild, updated);

        // Public announcement in the ticket (SOP: every stage announces)
        return interaction.reply({ content: `✅ <@${interaction.user.id}> joined the case roster.` });
    },
};
