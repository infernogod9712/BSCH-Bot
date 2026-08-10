const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, sendFinalCloseEmbed, isLeadOrSenior } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("copyphasedone")
        .setDescription("Close out the template-bank step (and confirm the copy, if any), then start closing (Lead)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (!isLeadOrSenior(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only the Lead (or the Builder who copied) can run this.", flags: 64 });
        }

        // If the client consented to a template-bank copy, this command confirms it's done.
        const tb = record.templateBank || {};
        const patch = { status: "closing" };
        if (tb.clientConsent === "yes") {
            patch.templateBank = { ...tb, copiedConfirmed: true };
        }
        const updated = store.updateCase(record.ticketId, patch);
        await updateCaseViews(interaction.guild, updated);

        await interaction.reply({
            content: tb.clientConsent === "yes"
                ? "✅ Copy confirmed done. Sending the client the final close-out..."
                : "✅ Template-bank step closed out. Sending the client the final close-out...",
            flags: 64,
        });

        // Step 9 — final close embed to the client
        await sendFinalCloseEmbed(interaction.channel, updated, config);
    },
};
