// handlers/statuspanel.js
// The live "what's happening right now" panel: every open case and what phase
// it's on, drills, applications, mod mail, and how long the bot has been up.
// Posted with /postpanel and redrawn on the 15-minute sweep.

const hireStore = require('../hire/store');
const onboarding = require('../onboarding/store');
const modmail = require('../modmail/store');
const panels = require('../stats/panels');

// A case's status turned into something a person can read at a glance.
const PHASES = {
  'open': '🟡 Waiting on a Builder to claim',
  'claimed': '🔵 Gathering requirements',
  'contract-accepted': '📜 Contract signed, waiting on server access',
  'contract-declined': '❌ Contract declined',
  'build-started': '🏗️ Building',
  'build-finished': '🏁 Build done, waiting on the client',
  'paperwork-filed': '📋 Paperwork filed, wrapping up',
  'closing': '🔒 Closing',
};

function phaseOf(record) {
  return PHASES[record.status] || record.status;
}

function since(iso) {
  if (!iso) return '';
  return ` · <t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
}

function uptime(client) {
  const ms = client && client.uptime ? client.uptime : process.uptime() * 1000;
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

// Keep a section inside Discord's 1024-character field limit.
function listField(name, lines, empty) {
  if (!lines.length) return { name, value: empty };
  let value = '';
  let shown = 0;
  for (const line of lines) {
    if (value.length + line.length + 1 > 950) break;
    value += (value ? '\n' : '') + line;
    shown += 1;
  }
  if (shown < lines.length) value += `\n*...and ${lines.length - shown} more*`;
  return { name: `${name} (${lines.length})`, value };
}

function buildStatusEmbed(client, config, guild) {
  const cases = hireStore.getAllCases().filter(c => c.status !== 'closed');
  const hireCases = cases.filter(c => !c.drill);
  const drillCases = cases.filter(c => c.drill);

  const caseLines = hireCases
    .sort((a, b) => Number(a.ticketId) - Number(b.ticketId))
    .map(c => `**#${c.ticketId}** <@${c.clientId}> — ${phaseOf(c)}${c.lead ? ` · Lead <@${c.lead}>` : ''}`);

  const drills = Object.values(onboarding.readData().drills || {}).filter(d => d.status === 'in-progress');
  const drillLines = drills.map(d => {
    const kind = d.department === 'mod' ? 'Moderation' : 'Building';
    const practice = drillCases.find(c => c.channelId === d.channelId);
    const build = d.department === 'builder'
      ? (d.buildSubmittedAt ? ' · build handed in' : ' · waiting on the build')
      : '';
    return `<@${d.traineeId}> — ${kind}, Head <@${d.headId}>${build}${practice ? ` · case ${practice.ticketId}` : ''}${since(d.createdAt)}`;
  });

  const applications = Object.values(onboarding.readData().applications || {});
  const filling = applications.filter(a => a.status === 'in-progress');
  const waiting = applications.filter(a => a.status === 'submitted');
  const fillingLines = filling.map(a => `<@${a.userId}> — question ${a.step + 1} of ${a.questions.length}${since(a.createdAt)}`);
  const waitingLines = waiting.map(a => `<@${a.userId}> — ${a.department === 'both' ? 'Building & Moderation' : a.department === 'mod' ? 'Moderation' : 'Building'}${since(a.createdAt)}`);

  const sessions = Object.values(modmail.readData().sessions || {}).filter(s => s.status === 'open');
  const modmailLines = sessions.map(s => `<@${s.userId}> — ${s.category}${since(s.openedAt)}`);

  // Support tickets and archived channels are counted straight off the server
  let supportOpen = 0;
  let archivedWaiting = 0;
  if (guild) {
    const supportCats = [config.categories.generalTickets, config.categories.buildHelpTickets, config.categories.bugTickets].filter(Boolean);
    supportOpen = guild.channels.cache.filter(c => supportCats.includes(c.parentId)).size;
    if (config.categories.archive) {
      archivedWaiting = guild.channels.cache.filter(c => c.parentId === config.categories.archive).size;
    }
  }

  const unclaimed = hireCases.filter(c => !c.lead).length;

  return {
    title: '📡 BSCH Status',
    color: 0x2ecc71,
    fields: [
      listField('🧾 Open hire cases', caseLines, 'Nothing open right now.'),
      listField('🎯 Drills in progress', drillLines, 'No drills running.'),
      listField('📝 Applications being filled in', fillingLines, 'Nobody is mid-application.'),
      listField('⏳ Applications awaiting approval', waitingLines, 'Nothing waiting on Senior Staff.'),
      listField('✉️ Open mod mail', modmailLines, 'No open conversations.'),
      {
        name: '📊 At a glance',
        value:
          `Unclaimed cases: **${unclaimed}**\n` +
          `Open support tickets: **${supportOpen}**\n` +
          `Archived tickets waiting to be deleted: **${archivedWaiting}**\n` +
          `Bot uptime: **${uptime(client)}**`,
      },
    ],
    footer: { text: 'Refreshes every 15 minutes, and whenever the bot restarts.' },
    timestamp: new Date().toISOString(),
  };
}

// Redraw the posted panel, if there is one. Called by the sweep.
async function refreshStatusPanel(guild, client, config) {
  const { channelId, messageId } = panels.get('status');
  if (!guild || !channelId || !messageId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildStatusEmbed(client, config, guild)] }).catch(() => {});
}

module.exports = { buildStatusEmbed, refreshStatusPanel, PHASES };
