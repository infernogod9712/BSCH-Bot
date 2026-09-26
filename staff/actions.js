// staff/actions.js
// Shared bits for the staff commands: which ranks exist, where things get
// logged, and returning people from a suspension.

const store = require('./store');

// value = the key in config.roles, so the actual role id comes from /config.
const RANKS = [
  { name: 'Owner', value: 'owner' },
  { name: 'Co-Owner', value: 'coOwner' },
  { name: 'Admin', value: 'admin' },
  { name: 'Head Staff', value: 'headStaff' },
  { name: 'Moderator', value: 'moderator' },
  { name: 'Builder', value: 'builder' },
  { name: 'Trainee', value: 'trainee' },
  { name: 'Member', value: 'member' },
];

const RANK_LABEL = Object.fromEntries(RANKS.map(r => [r.value, r.name]));

// Every role that means "on the team" — removed on a fire or a suspension.
function staffRoleIds(config) {
  const keys = ['owner', 'coOwner', 'admin', 'headStaff', 'moderator', 'builder', 'staffTeam', 'trainee'];
  const ids = keys.map(k => config.roles[k]).filter(Boolean);
  for (const id of config.staffRoles || []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

async function log(guild, config, channelKey, embed) {
  const channel = guild.channels.cache.get(config.channels[channelKey]);
  if (!channel) return false;
  return Boolean(await channel.send({ embeds: [embed] }).catch(() => null));
}

async function dm(member, embed) {
  if (!member) return;
  await member.send({ embeds: [embed] }).catch(() => {});
}

// Timer: hand back the roles of anyone whose suspension is over.
async function sweepSuspensions(guild, config) {
  for (const suspension of store.getExpiredSuspensions()) {
    const member = await guild.members.fetch(suspension.userId).catch(() => null);
    if (member) {
      for (const roleId of suspension.roleIds || []) await member.roles.add(roleId).catch(() => {});
      await dm(member, {
        title: '✅ Suspension over',
        description: 'Your suspension has ended and your staff roles are back. Welcome back!',
        color: 0x2ecc71,
      });
    }
    store.clearSuspension(suspension.userId);
    await log(guild, config, 'promotionsChannel', {
      title: '✅ Suspension ended',
      description: `<@${suspension.userId}>'s suspension ran out and their roles were restored.`,
      color: 0x2ecc71,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = { RANKS, RANK_LABEL, staffRoleIds, log, dm, sweepSuspensions };
