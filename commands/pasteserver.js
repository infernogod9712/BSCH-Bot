const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
} = require("discord.js");
const templates = require("../hire/templates");
const { applyTemplate } = require("../hire/serverclone");
// Roles are checked in the main BSCH server, since this runs in a client's server
const { isMainServerBuilder } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pasteserver")
        .setDescription("Recreate a saved template's channels and roles in THIS server (Builder).")
        .addStringOption(o =>
            o.setName("name").setDescription("Which saved template to paste").setRequired(true)),

    async execute(interaction, client, config) {
        if (!(await isMainServerBuilder(client, interaction.user.id, config))) {
            return interaction.reply({ content: "❌ Only Builders can paste a server.", flags: 64 });
        }

        // The bot itself needs these permissions to build the structure.
        const me = interaction.guild.members.me;
        if (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: "❌ I need the **Manage Channels** and **Manage Roles** permissions in this server to paste a template.",
                flags: 64,
            });
        }

        const name = interaction.options.getString("name");
        const template = templates.getTemplate(name);
        if (!template) {
            const available = templates.listTemplates().map(t => `\`${t.name}\``).join(", ") || "(none saved yet)";
            return interaction.reply({ content: `❌ No template named **${name}**.\nAvailable: ${available}`, flags: 64 });
        }

        // Confirmation — this creates a lot of channels/roles.
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("pasteconfirm").setLabel("Yes, build it").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("pastecancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({
            embeds: [{
                title: `⚠️ Paste template "${template.name}"?`,
                color: 0xe67e22,
                description:
                    `This will CREATE the following in **this** server:\n` +
                    `• ${template.counts.roles} roles\n` +
                    `• ${template.counts.categories} categories\n` +
                    `• ${template.counts.channels} channels\n\n` +
                    `Nothing existing is deleted, but this adds a lot. Continue?`,
            }],
            components: [confirmRow],
            flags: 64,
        });

        const reply = await interaction.fetchReply();

        let choice;
        try {
            choice = await reply.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                time: 30000,
            });
        } catch {
            return interaction.editReply({ content: "⏳ Timed out — nothing was created.", embeds: [], components: [] });
        }

        if (choice.customId === "pastecancel") {
            return choice.update({ content: "❌ Cancelled — nothing was created.", embeds: [], components: [] });
        }

        // Confirmed — build it.
        await choice.update({ content: "🔧 Building the server structure... this can take a moment.", embeds: [], components: [] });

        const result = await applyTemplate(interaction.guild, template);

        // Keep a log of the paste in the template-log forum.
        const logEmbed = {
            title: `📥 Template Pasted — ${template.name}`,
            color: 0x2ecc71,
            fields: [
                { name: "Into Server", value: interaction.guild.name, inline: true },
                { name: "By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Created", value: `${result.roles} roles, ${result.categories} categories, ${result.channels} channels`, inline: false },
                ...(result.errors.length ? [{ name: `Skipped (${result.errors.length})`, value: result.errors.slice(0, 8).join("\n").slice(0, 1000) }] : []),
            ],
            timestamp: new Date().toISOString(),
        };
        // Log in the main BSCH server, not the client's server we just built in
        const main = client.guilds.cache.get(config.guildId);
        const forum = main ? main.channels.cache.get(config.channels.templateLogForum) : null;
        if (forum && forum.type === ChannelType.GuildForum) {
            await forum.threads.create({ name: `Pasted: ${template.name}`, message: { embeds: [logEmbed] } }).catch(() => {});
        } else if (forum) {
            await forum.send({ embeds: [logEmbed] }).catch(() => {});
        }

        return interaction.editReply({
            content:
                `✅ Done! Created **${result.roles}** roles, **${result.categories}** categories, **${result.channels}** channels.` +
                (result.errors.length ? `\n⚠️ ${result.errors.length} item(s) were skipped (usually permission limits). See the template-log forum for details.` : ""),
            embeds: [],
            components: [],
        });
    },
};
