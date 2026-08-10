const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews } = require("../handlers/hiringhandler");

function isBuilderOrSenior(member, config) {
    if (config.roles.builder && member.roles.cache.has(config.roles.builder)) return true;
    const seniorIds = (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);
    return seniorIds.some(id => member.roles.cache.has(id));
}

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

        if (!isBuilderOrSenior(interaction.member, config)) {
            return interaction.reply({ content: "❌ Only Builders on the case can add Extra Info.", flags: 64 });
        }

        const text = interaction.options.getString("text");
        const newList = [...(record.extraInfo || []), text];

        const updated = store.updateCase(record.ticketId, { extraInfo: newList });

        await updateCaseViews(interaction.guild, updated);

        return interaction.reply({ content: `✅ Extra Info #${newList.length} recorded.` });
    },
};
