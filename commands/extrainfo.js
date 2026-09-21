const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, isCaseBuilder } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("extrainfo")
        .setDescription("Record a new requirement on this hire case.")
        .addStringOption(o =>
            o.setName("text")
                .setDescription("The requirement / detail to record")
                .setRequired(true)
        ),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }

        if (!isCaseBuilder(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only Builders on the case can add Extra Info.", flags: 64 });
        }

        const text = interaction.options.getString("text");
        const newList = [...(record.extraInfo || []), text];

        const updated = store.updateCase(record.ticketId, { extraInfo: newList });

        await updateCaseViews(interaction.guild, updated);

        return interaction.reply({ content: `✅ Extra Info #${newList.length} recorded.` });
    },
};
