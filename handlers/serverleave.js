// handlers/serverleave.js
// The bot joins clients' servers to build them. Once a build is over it
// shouldn't stay there, so it leaves every server except the main BSCH server
// and the drill server:
//   - a server tied to an open hire case: stay
//   - a server whose cases are all closed: leave 24h after the last one closed
//   - a server no case points to: leave 24h after joining it
// A case is tied to a server through the invite the client sent, which
// Discord turns into the server's id.

const store = require("../hire/store");
const { botLog } = require("./botlog");

const GRACE_MS = 24 * 60 * 60 * 1000;

// Servers the bot never leaves
function homeServers(config) {
    return new Set([config.guildId, config.drillGuildId].filter(Boolean));
}

// Look up which server a discord.gg invite belongs to
async function guildIdFromInvite(client, invite) {
    if (!invite) return null;
    // Capped at 2s: this runs before a button reply, which Discord times out at 3s
    const found = await Promise.race([
        client.fetchInvite(invite).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 2000)),
    ]);
    return found && found.guild ? found.guild.id : null;
}

// Fill in clientGuildId for cases that have an invite but no server id yet.
// A failed lookup (expired invite) is remembered so it isn't retried forever.
async function linkCases(client) {
    for (const record of store.getAllCases()) {
        if (record.drill || record.clientGuildId || !record.serverInvite) continue;
        if (record.inviteLookupFailed === record.serverInvite) continue;
        const guildId = await guildIdFromInvite(client, record.serverInvite);
        store.updateCase(record.ticketId, guildId
            ? { clientGuildId: guildId }
            : { inviteLookupFailed: record.serverInvite });
    }
}

async function sweepServers(client, config) {
    await linkCases(client);
    const keep = homeServers(config);
    const cases = store.getAllCases().filter(c => !c.drill && c.clientGuildId);
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
        if (keep.has(guild.id)) continue;

        const mine = cases.filter(c => c.clientGuildId === guild.id);
        if (mine.some(c => c.status !== "closed")) continue;

        let leaveAt, reason;
        if (mine.length) {
            const lastClosed = Math.max(...mine.map(c => new Date(c.closedAt || 0).getTime()));
            leaveAt = lastClosed + GRACE_MS;
            reason = `Case ${mine.map(c => `#${c.ticketId}`).join(", ")} closed over 24 hours ago.`;
        } else {
            leaveAt = (guild.joinedTimestamp || now) + GRACE_MS;
            reason = "No hire case is linked to this server, and I joined over 24 hours ago.";
        }
        if (now < leaveAt) continue;

        const name = guild.name;
        const id = guild.id;
        const left = await guild.leave().then(() => true).catch(() => false);
        await botLog(client, config, {
            kind: left ? "leave" : "error",
            title: left ? "Left a server" : "Couldn't leave a server",
            description: reason,
            fields: [{ name: "Server", value: `${name} (${id})` }],
        });
    }
}

module.exports = { sweepServers, guildIdFromInvite, homeServers };
