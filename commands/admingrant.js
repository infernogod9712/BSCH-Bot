const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const store = require("../hire/store");
const { isCaseBuilder } = require("../handlers/hiringhandler");

// The Lead runs this to ask the client for access. The bot spells out exactly
// what the client has to do, and the Lead presses the button once they can see
// they actually have it — which starts the build.

module.exports = {
    data: new SlashCommandBuilder()
        .setName("admingrant")
        .setDescription("Ask the client for admin access, then confirm it with a button (Builder)."),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (!isCaseBuilder(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only Builders on the case can ask for access.", flags: 64 });
        }
        if (record.adminGrantedAt) {
            return interaction.reply({ content: "❌ Server access is already logged as granted.", flags: 64 });
        }

        const builders = (record.roster && record.roster.length ? record.roster : [interaction.user.id])
            .map(id => `<@${id}>`)
            .join(", ");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("hire_admin_done")
                .setLabel("✅ Finished — we have access")
                .setStyle(ButtonStyle.Success),
        );

        await interaction.channel.send({
            content: `<@${record.clientId}>`,
            embeds: [{
                title: "🔑 Time to give us access",
                color: 0x3498db,
                description:
                    "To build in your server we need admin access. In **your** server:\n\n" +
                    "**1.** Make a new role, call it something like **BSCH Build**.\n" +
                    "**2.** Turn on **Administrator** for that role.\n" +
                    "**3.** Drag it to the **very top** of your role list, above every other role. " +
                    "A role below yours can't edit things above it, so this is the part people miss.\n" +
                    `**4.** Give that role to your builder(s): ${builders}\n\n` +
                    "When that's done, say so here and your Lead will confirm below. Only the people listed above get access, " +
                    "and it's only used for the work agreed in this ticket. You can remove it the moment the build is finished.",
                footer: { text: "The Lead presses the button once they can actually see the access." },
            }],
            components: [row],
        });

        return interaction.reply({ content: "✅ Asked the client for access. Press the button once you can see it.", flags: 64 });
    },
};
