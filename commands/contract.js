const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const store = require("../hire/store");
const contract = require("../contract");
const { updateCaseViews } = require("../handlers/hiringhandler");

function seniorIdsOf(config) {
    return (config.roles.seniorStaffRoles || [])
        .map(name => config.roles[name])
        .filter(Boolean);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("contract")
        .setDescription("Send the hiring contract to the client for Accept/Decline (Lead only)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }

        // Only the Lead (or Senior Staff) can send the contract
        const isLead = interaction.user.id === record.lead;
        const isSenior = seniorIdsOf(config).some(id => interaction.member.roles.cache.has(id));
        if (!isLead && !isSenior) {
            return interaction.reply({ content: "❌ Only the case Lead can send the contract.", flags: 64 });
        }

        if (!record.lead) {
            return interaction.reply({ content: "❌ This case must be claimed before sending a contract.", flags: 64 });
        }

        // SOP Step 4: snapshot the CURRENT contract text onto the case at send time,
        // so the client's agreement is tied to exactly what they saw.
        store.updateCase(record.ticketId, {
            contract: {
                text: contract.TEXT,
                version: contract.VERSION,
                sentAt: new Date().toISOString(),
                acceptedAt: null,
                declinedAt: null,
                declineReason: null,
            },
        });

        const parts = contract.chunks();
        const embeds = parts.map((text, i) => ({
            title: i === 0 ? "📜 BSCH Hiring Contract" : undefined,
            color: 0xf1c40f,
            description: text,
            footer: i === parts.length - 1
                ? { text: `Case #${record.ticketId} — contract ${contract.VERSION}, snapshotted to your case.` }
                : undefined,
        }));

        // Accepting also answers the template bank question (section 5)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("hire_contract_accept_copy")
                .setLabel("✅ Accept — you may reuse my build")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("hire_contract_accept_nocopy")
                .setLabel("✅ Accept — don't reuse my build")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("hire_contract_decline")
                .setLabel("❌ Decline")
                .setStyle(ButtonStyle.Danger),
        );

        await interaction.channel.send({
            content: `<@${record.clientId}>, please read the contract below and pick one of the buttons.`,
            embeds,
            components: [row],
        });

        // Refresh the case views so the "Contract: Sent" status shows immediately
        const refreshed = store.getCaseByChannel(interaction.channel.id);
        await updateCaseViews(interaction.guild, refreshed);

        return interaction.reply({ content: "✅ Contract sent to the client.", flags: 64 });
    },
};
