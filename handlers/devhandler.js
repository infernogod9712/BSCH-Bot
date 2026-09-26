// handlers/devhandler.js
// Owner-only chat commands for running the bot itself. Everything here is
// locked to the roles in config.roles.ownership, and nothing here touches
// case, staff or member data.
//
//   d!restart   restart the bot (PM2 brings it straight back up)
//   d!status    quick health check without opening the Pi
//   d!dev       list these commands

const os = require('os');
const store = require('../hire/store');

// The only gate in this file. Owner and Co-Owner by default, set in config.
function isOwnership(member, config) {
  const ids = (config.roles && config.roles.ownership) || [];
  if (!ids.length) return false;
  return ids.some(id => member.roles.cache.has(id));
}

function uptimeText(client) {
  const total = Math.floor((client.uptime || 0) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

async function handleMessage(message, client, config) {
  const content = message.content.trim().toLowerCase();
  if (!content.startsWith('d!')) return false;

  // Silent for everyone else: dev commands shouldn't advertise themselves
  if (!message.member || !isOwnership(message.member, config)) return true;

  const command = content.slice(2).split(/\s+/)[0];

  if (command === 'restart') {
    await message.reply('♻️ Restarting now. I should be back in a few seconds.').catch(() => {});
    console.log(`Restart requested by ${message.author.tag}.`);
    // PM2 restarts the process as soon as it exits
    await client.destroy().catch(() => {});
    setTimeout(() => process.exit(0), 500);
    return true;
  }

  if (command === 'status') {
    const openCases = store.getAllCases().filter(c => c.status !== 'closed');
    const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);
    await message.reply({
      embeds: [{
        title: '🛠️ Bot health',
        color: 0x5865f2,
        fields: [
          { name: 'Uptime', value: uptimeText(client), inline: true },
          { name: 'Memory', value: `${memory} MB`, inline: true },
          { name: 'Ping', value: `${Math.round(client.ws.ping)} ms`, inline: true },
          { name: 'Commands loaded', value: String(client.commands.size), inline: true },
          { name: 'Open cases', value: String(openCases.length), inline: true },
          { name: 'Host', value: `${os.hostname()} · node ${process.version}`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    }).catch(() => {});
    return true;
  }

  if (command === 'dev') {
    await message.reply({
      embeds: [{
        title: '🛠️ Owner commands',
        color: 0x5865f2,
        description: '`d!restart` — restart the bot\n`d!status` — uptime, memory, ping\n`d!dev` — this list',
        footer: { text: 'Owner and Co-Owner only.' },
      }],
    }).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { handleMessage, isOwnership };
