const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews } = require("../handlers/hiringhandler");

function seniorIdsOf(config) {
    return (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("removefromcase")
        .setDescription("Remove a Builder from this case's roster (Lead only).")
        .addUserOption(o =>
            o.setName("builder")
                .setDescription("The Builder to remove")
                .setRequired(true)
        ),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }

        // Only the Lead (or Senior Staff) may remove someone
        const isLead = interaction.user.id === record.lead;
        const isSenior = seniorIdsOf(config).some(id => interaction.member.roles.cache.has(id));
        if (!isLead && !isSenior) {
            return interaction.reply({ content: "❌ Only the Lead can remove Builders from the case.", flags: 64 });
        }

        const target = interaction.options.getUser("builder");

        if (target.id === record.lead) {
            return interaction.reply({ content: "❌ You can't remove the Lead from the case.", flags: 64 });
        }

        if (!record.roster.includes(target.id)) {
            return interaction.reply({ content: `❌ <@${target.id}> isn't on this case.`, flags: 64 });
        }

        const updated = store.updateCase(record.ticketId, {
            roster: record.roster.filter(id => id !== target.id),
        });

        await updateCaseViews(interaction.guild, updated);

        return interaction.reply({ content: `✅ <@${target.id}> was removed from the case roster.` });
    },
};
