const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, isSenior, isCaseBuilder } = require("../handlers/hiringhandler");

// Hands the Lead role on a hire case to another Builder. The Lead can pass it
// on themselves; Senior Staff can force it, for when a Lead has gone quiet.
// The old Lead stays on the roster as a helper.

module.exports = {
    data: new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Hand this hire case to a new Lead (the Lead, or Senior Staff to force it).")
        .addUserOption(o =>
            o.setName("builder")
                .setDescription("The Builder who becomes Lead")
                .setRequired(true)
        ),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (record.status === "closed") {
            return interaction.reply({ content: "❌ This case is closed, so there's no Lead to hand over.", flags: 64 });
        }
        if (!record.lead) {
            return interaction.reply({ content: "❌ Nobody has claimed this case yet. A Builder can press Claim instead.", flags: 64 });
        }

        const isLead = interaction.user.id === record.lead;
        const forced = !isLead && isSenior(interaction.member, config);
        if (!isLead && !forced) {
            return interaction.reply({ content: "❌ Only the Lead can hand this case over. Senior Staff can force a transfer.", flags: 64 });
        }

        const target = interaction.options.getUser("builder");
        if (target.id === record.lead) {
            return interaction.reply({ content: `❌ <@${target.id}> is already the Lead.`, flags: 64 });
        }
        if (target.bot) {
            return interaction.reply({ content: "❌ A bot can't lead a case.", flags: 64 });
        }

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) {
            return interaction.reply({ content: `❌ <@${target.id}> isn't in this server.`, flags: 64 });
        }
        if (!isCaseBuilder(member, record, config)) {
            return interaction.reply({ content: `❌ <@${target.id}> isn't a Builder, so they can't lead a case.`, flags: 64 });
        }

        const oldLead = record.lead;
        const roster = record.roster.includes(target.id) ? record.roster : [...record.roster, target.id];

        // New Lead goes to the front of the roster, everyone else keeps their place
        const updated = store.updateCase(record.ticketId, {
            lead: target.id,
            roster: [target.id, ...roster.filter(id => id !== target.id)],
        });
        await updateCaseViews(interaction.guild, updated);

        return interaction.reply({
            content: forced
                ? `🔁 <@${interaction.user.id}> moved this case from <@${oldLead}> to <@${target.id}>, who is now **Lead**. <@${oldLead}> stays on the roster as a helper.`
                : `🔁 <@${oldLead}> handed this case to <@${target.id}>, who is now **Lead**. <@${oldLead}> stays on the roster as a helper.`,
            allowedMentions: { users: [target.id, oldLead] },
        });
    },
};
