const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews } = require("../handlers/hiringhandler");

// Helper: is this member a Builder or Senior Staff?
function isBuilderOrSenior(member, config) {
    if (config.roles.builder && member.roles.cache.has(config.roles.builder)) return true;
    const seniorIds = (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);
    return seniorIds.some(id => member.roles.cache.has(id));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("addtocase")
        .setDescription("Add yourself to this hire case's roster (Builders)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }

        if (!isBuilderOrSenior(interaction.member, config)) {
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
