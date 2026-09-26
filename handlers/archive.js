// handlers/archive.js
// Closed tickets move to the archive category instead of being deleted, so
// staff can still read them. The bot deletes an archived ticket once it has
// been quiet for archiveDeleteDays. /delete removes one straight away.

const { PermissionFlagsBits, ChannelType } = require('discord.js');

// Move a ticket into the archive category and lock it.
async function archiveChannel(guild, channel, config, closedById) {
  if (!channel) return false;

  const archive = config.categories.archive;
  if (!archive) {
    console.error('No archive category set — deleting the ticket instead. Set it with /config.');
    setTimeout(() => channel.delete().catch(() => {}), 3000);
    return false;
  }

  const name = channel.name.startsWith('closed-') ? channel.name : `closed-${channel.name}`.slice(0, 100);

  // Everyone who could talk keeps reading, nobody keeps typing
  const overwrites = channel.permissionOverwrites.cache.map(o => ({
    id: o.id,
    type: o.type,
    allow: o.allow.remove(PermissionFlagsBits.SendMessages),
    deny: o.deny.add(PermissionFlagsBits.SendMessages),
  }));

  const moved = await channel.edit({ name, parent: archive, lockPermissions: false, permissionOverwrites: overwrites })
    .catch(err => { console.error(`Could not archive #${channel.name}:`, err.message); return null; });
  if (!moved) return false;

  const days = config.timers.archiveDeleteDays || 7;
  await channel.send({
    embeds: [{
      title: '🗄️ Ticket archived',
      description:
        `Closed by ${closedById ? `<@${closedById}>` : 'the bot'}. Staff can still read this.\n` +
        `It deletes itself after **${days} days** of quiet, or right away with \`/delete\`.`,
      color: 0x95a5a6,
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => {});

  return true;
}

// Delete archived tickets that have been quiet for long enough.
async function sweepArchive(guild, config) {
  const archive = config.categories.archive;
  if (!archive) return;
  const days = config.timers.archiveDeleteDays || 7;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;

  const channels = guild.channels.cache.filter(c => c.parentId === archive && c.type === ChannelType.GuildText);
  for (const channel of channels.values()) {
    const last = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    const lastAt = last && last.size ? last.first().createdTimestamp : channel.createdTimestamp;
    if (lastAt > cutoff) continue;
    await channel.delete(`Archived ticket quiet for ${days} days`).catch(() => {});
  }
}

module.exports = { archiveChannel, sweepArchive };
