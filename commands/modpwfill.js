const { SlashCommandBuilder, ChannelType } = require("discord.js");

// SOP Section 3 (Logging): after a Wick moderation action, the Moderator files
// the paperwork with /modpwfill. It posts to a forum channel for later review.

// Who may file mod paperwork: Moderator and above (Senior Staff included).
function isModOrSenior(member, config) {
    const ids = [config.roles.moderator, ...(config.roles.seniorStaffRoles || []).map(n => config.roles[n])]
        .filter(Boolean);
    return ids.some(id => member.roles.cache.has(id));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("modpwfill")
        .setDescription("File moderation paperwork for a Wick action (Moderator).")
        .addUserOption(o =>
            o.setName("user").setDescription("The member the action was taken against").setRequired(true))
        .addStringOption(o =>
            o.setName("action").setDescription("What action was taken").setRequired(true)
                .addChoices(
                    { name: "Warn", value: "Warn" },
                    { name: "Timeout", value: "Timeout" },
                    { name: "Quarantine", value: "Quarantine" },
                    { name: "Kick", value: "Kick" },
                    { name: "Ban", value: "Ban" },
                    { name: "Channel Lock", value: "Channel Lock" },
                    { name: "Other", value: "Other" },
                ))
        .addStringOption(o =>
            o.setName("reason").setDescription("Why the action was taken").setRequired(true))
        .addStringOption(o =>
            o.setName("duration").setDescription("How long (for timeouts/bans), if any").setRequired(false))
        .addStringOption(o =>
            o.setName("proof").setDescription("Link to evidence (screenshot, message link, etc.)").setRequired(false))
        .addStringOption(o =>
            o.setName("rule").setDescription("Which rule was broken").setRequired(false)),

    async execute(interaction, client, config) {
        if (!isModOrSenior(interaction.member, config)) {
            return interaction.reply({ content: "❌ Only Moderators can file moderation paperwork.", flags: 64 });
        }

        const target = interaction.options.getUser("user");
        const action = interaction.options.getString("action");
        const reason = interaction.options.getString("reason");
        const duration = interaction.options.getString("duration");
        const proof = interaction.options.getString("proof");
        const rule = interaction.options.getString("rule");

        await interaction.deferReply({ flags: 64 });

        const fields = [
            { name: "Member", value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
            { name: "Action", value: action, inline: true },
            { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Reason", value: reason },
        ];
        if (duration) fields.push({ name: "Duration", value: duration, inline: true });
        if (rule) fields.push({ name: "Rule Broken", value: rule, inline: true });
        if (proof) fields.push({ name: "Proof", value: proof });

        const embed = {
            title: `🛡️ Moderation Record — ${action}`,
            color: 0xe74c3c,
            fields,
            footer: { text: `Filed by ${interaction.user.tag}` },
            timestamp: new Date().toISOString(),
        };

        // Post to the mod-paperwork forum (falls back to mod-logs if no forum set)
        const destId = config.channels.modPaperworkForum || config.channels.modLogsChannel;
        const dest = destId ? interaction.guild.channels.cache.get(destId) : null;

        if (!dest) {
            return interaction.editReply({
                content: "⚠️ Paperwork wasn't posted — set the Mod paperwork forum (or Mod logs channel) with `/config`.",
            });
        }

        let posted = false;
        if (dest.type === ChannelType.GuildForum) {
            await dest.threads.create({
                name: `${action} — ${target.username}`.slice(0, 90),
                message: { embeds: [embed] },
            }).catch(() => {});
            posted = true;
        } else {
            await dest.send({ embeds: [embed] }).catch(() => {});
            posted = true;
        }

        return interaction.editReply({
            content: posted
                ? `✅ Paperwork filed for **${action}** on <@${target.id}>.`
                : "⚠️ Couldn't post the paperwork — check the channel with `/config`.",
        });
    },
};
