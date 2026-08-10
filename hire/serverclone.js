// hire/serverclone.js
// Reads a guild's structure into a portable template (snapshotGuild) and
// rebuilds that structure inside another guild (applyTemplate).
//
// Permission overwrites are stored by ROLE NAME (not id) so they can be
// re-resolved to the new roles when the template is pasted into a different
// server. Member-specific overwrites are skipped — they can't port.

const { ChannelType } = require("discord.js");

// Turn one channel's role overwrites into a portable, name-keyed list.
function overwritesToPortable(channel, guild) {
    const out = [];
    channel.permissionOverwrites.cache.forEach(ow => {
        if (ow.type !== 0) return; // 0 = role overwrite; skip member (type 1)
        let roleName;
        if (ow.id === guild.roles.everyone.id) {
            roleName = "@everyone";
        } else {
            const role = guild.roles.cache.get(ow.id);
            if (!role) return;
            roleName = role.name;
        }
        out.push({
            roleName,
            allow: ow.allow.bitfield.toString(),
            deny: ow.deny.bitfield.toString(),
        });
    });
    return out;
}

// Snapshot the whole guild (roles + categories + channels) into a template.
function snapshotGuild(guild) {
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.roles.everyone.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map(r => ({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            mentionable: r.mentionable,
            permissions: r.permissions.bitfield.toString(),
            position: r.position,
        }));

    const all = guild.channels.cache;

    const categories = all
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position)
        .map(c => ({
            name: c.name,
            position: c.position,
            overwrites: overwritesToPortable(c, guild),
        }));

    const channels = all
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(c => ({
            name: c.name,
            type: c.type,
            topic: c.topic || null,
            nsfw: c.nsfw || false,
            rateLimitPerUser: c.rateLimitPerUser || 0,
            bitrate: c.bitrate || null,
            userLimit: c.userLimit || null,
            parentName: c.parent ? c.parent.name : null,
            position: c.rawPosition,
            overwrites: overwritesToPortable(c, guild),
        }));

    return {
        sourceGuildId: guild.id,
        sourceGuildName: guild.name,
        roles,
        categories,
        channels,
        counts: { roles: roles.length, categories: categories.length, channels: channels.length },
    };
}

// Rebuild a template's structure inside the given guild.
async function applyTemplate(guild, template) {
    const result = { roles: 0, categories: 0, channels: 0, errors: [] };

    // Map role NAME -> new role id. @everyone already exists.
    const roleMap = new Map();
    roleMap.set("@everyone", guild.roles.everyone.id);

    // Create roles from lowest to highest so the hierarchy stacks correctly.
    const rolesAsc = [...template.roles].sort((a, b) => a.position - b.position);
    for (const r of rolesAsc) {
        try {
            const role = await guild.roles.create({
                name: r.name,
                color: r.color || undefined,
                hoist: r.hoist,
                mentionable: r.mentionable,
                permissions: BigInt(r.permissions || "0"),
                reason: "pasteserver template",
            });
            roleMap.set(r.name, role.id);
            result.roles++;
        } catch (e) {
            result.errors.push(`role "${r.name}": ${e.message}`);
        }
    }

    const buildOverwrites = (ows) =>
        (ows || [])
            .map(o => {
                const id = roleMap.get(o.roleName);
                if (!id) return null;
                return { id, allow: BigInt(o.allow || "0"), deny: BigInt(o.deny || "0") };
            })
            .filter(Boolean);

    // Create categories, remembering each new id by its old name.
    const catMap = new Map();
    for (const c of template.categories) {
        try {
            const cat = await guild.channels.create({
                name: c.name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: buildOverwrites(c.overwrites),
                reason: "pasteserver template",
            });
            catMap.set(c.name, cat.id);
            result.categories++;
        } catch (e) {
            result.errors.push(`category "${c.name}": ${e.message}`);
        }
    }

    // Create the channels under their categories.
    for (const ch of template.channels) {
        try {
            const opts = {
                name: ch.name,
                type: ch.type,
                permissionOverwrites: buildOverwrites(ch.overwrites),
                reason: "pasteserver template",
            };
            if (ch.parentName && catMap.has(ch.parentName)) opts.parent = catMap.get(ch.parentName);
            // topic applies to text / announcement / forum channels
            if (ch.topic && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement || ch.type === ChannelType.GuildForum)) {
                opts.topic = ch.topic;
            }
            if (ch.nsfw) opts.nsfw = true;
            if (ch.rateLimitPerUser) opts.rateLimitPerUser = ch.rateLimitPerUser;
            if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
                if (ch.bitrate) opts.bitrate = ch.bitrate;
                if (ch.userLimit) opts.userLimit = ch.userLimit;
            }
            await guild.channels.create(opts);
            result.channels++;
        } catch (e) {
            result.errors.push(`channel "${ch.name}": ${e.message}`);
        }
    }

    return result;
}

module.exports = { snapshotGuild, applyTemplate };
