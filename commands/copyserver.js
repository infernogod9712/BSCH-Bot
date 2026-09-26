const { SlashCommandBuilder, AttachmentBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const templates = require("../hire/templates");
const { snapshotGuild } = require("../hire/serverclone");
// Roles are checked in the main BSCH server, since this runs in a client's server
const { isMainServerBuilder } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("copyserver")
        .setDescription("Save THIS server's channels and roles into the BSCH template bank (Builder).")
        .addStringOption(o =>
            o.setName("name").setDescription("A name for this template (e.g. scp-site-19)").setRequired(true))
        .addStringOption(o =>
            o.setName("description").setDescription("Short note about this template").setRequired(false)),

    async execute(interaction, client, config) {
        if (!(await isMainServerBuilder(client, interaction.user.id, config))) {
            return interaction.reply({ content: "❌ Only Builders can copy a server.", flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const name = interaction.options.getString("name");
        const description = interaction.options.getString("description") || "";

        // 1) Snapshot the server this command was run in
        const snapshot = snapshotGuild(interaction.guild);

        // 2) Save it into the template bank (data/)
        const saved = templates.saveTemplate(name, {
            ...snapshot,
            description,
            copiedAt: new Date().toISOString(),
            copiedBy: interaction.user.id,
        });

        // 3) Make a log in the template-log forum so we know what's in the bank
        const file = new AttachmentBuilder(
            Buffer.from(JSON.stringify(saved, null, 2), "utf-8"),
            { name: `template-${saved.key}.json` }
        );

        const logEmbed = {
            title: `🗃️ Template Saved — ${name}`,
            color: 0x9b59b6,
            fields: [
                { name: "Source Server", value: `${snapshot.sourceGuildName}`, inline: true },
                { name: "Saved By", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Roles", value: String(snapshot.counts.roles), inline: true },
                { name: "Categories", value: String(snapshot.counts.categories), inline: true },
                { name: "Channels", value: String(snapshot.counts.channels), inline: true },
                ...(description ? [{ name: "Note", value: description }] : []),
            ],
            footer: { text: `Paste it later with: /pasteserver name:${name}` },
            timestamp: new Date().toISOString(),
        };

        // The log lives in the MAIN BSCH server, not the client's server this
        // command was run in.
        let logged = false;
        let logError = "";
        const main = client.guilds.cache.get(config.guildId);
        const forum = main ? main.channels.cache.get(config.channels.templateLogForum) : null;
        if (!main) {
            logError = "I'm not in the main BSCH server, or `guildId` is wrong.";
        } else if (!forum) {
            logError = "The template log channel wasn't found in the BSCH server. Set it with `/config`.";
        } else if (forum.type === ChannelType.GuildForum) {
            const thread = await forum.threads.create({
                name: `${name} — ${snapshot.counts.channels} channels`,
                message: { embeds: [logEmbed], files: [file] },
            }).catch(err => { logError = err.message; return null; });
            logged = Boolean(thread);
        } else {
            const msg = await forum.send({ embeds: [logEmbed], files: [file] }).catch(err => { logError = err.message; return null; });
            logged = Boolean(msg);
        }

        return interaction.editReply({
            content:
                `✅ Saved **${name}** to the template bank: ` +
                `${snapshot.counts.roles} roles, ${snapshot.counts.categories} categories, ${snapshot.counts.channels} channels.` +
                (logged ? "\n📓 Logged to the template-log forum." : `\n⚠️ Saved, but I couldn't log it: ${logError}`),
        });
    },
};
