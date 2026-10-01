const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require('discord.js');
const hireStore = require('../hire/store');

// Wipes the drill server back to a blank slate for the next builder drill:
// kicks everyone who isn't a drill supervisor, deletes every role, channel and
// category except the ones below, then renames the server after the drill.
//
// Only works in the drill server, and only for drill supervisors. It asks for
// confirmation first, because none of this can be undone.

const DRILL_SERVER = '1553141233407234139';
const SUPERVISOR_ROLE = '1553145606095241257';

const KEEP_ROLES = new Set([
  SUPERVISOR_ROLE,
  '1553382403949461597',   // the bot's own role
  '1553145758750871583',   // trainee audit role
  '1553145821657043044',   // "any roles below this will be marked" divider
]);

const KEEP_CHANNELS = new Set([
  '1555030909584146512',   // the temp channel
]);

// Empties a channel except for pinned messages. Discord only bulk-deletes
// messages under 14 days old, so anything older goes one at a time.
const TWO_WEEKS = 14 * 24 * 3600 * 1000 - 3600 * 1000;   // an hour's margin

async function clearChannel(channel) {
  let cleared = 0;
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;
    before = batch.last().id;      // page backwards, so stuck messages can't loop us

    const doomed = [...batch.values()].filter(m => !m.pinned);
    const fresh = doomed.filter(m => Date.now() - m.createdTimestamp < TWO_WEEKS);
    const old = doomed.filter(m => Date.now() - m.createdTimestamp >= TWO_WEEKS);

    if (fresh.length > 1) {
      const gone = await channel.bulkDelete(fresh.map(m => m.id), true).catch(() => null);
      cleared += gone ? gone.size : 0;
    } else {
      old.push(...fresh);
    }
    for (const message of old) {
      if (await message.delete().then(() => true).catch(() => false)) cleared += 1;
    }

    if (batch.size < 100) break;
  }
  return cleared;
}

// D1 -> "Drill #01 - Tikohunts"
function serverName(number, user) {
  const name = user.username.charAt(0).toUpperCase() + user.username.slice(1);
  return `Drill #${String(number).padStart(2, '0')} - ${name}`.slice(0, 100);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drillserverreset')
    .setDescription('Wipe the drill server for a new builder drill (drill supervisors).')
    .addIntegerOption(o =>
      o.setName('drill').setDescription('Which drill: start typing a name or number to pick from the list')
        .setRequired(true).setMinValue(1).setAutocomplete(true)),

  // Lists every builder drill as "D3 - username", newest first, so nobody has
  // to remember the number.
  async autocomplete(interaction) {
    const typed = String(interaction.options.getFocused() || '').toLowerCase();
    // Finished drills are left out, or the list fills up with old ones
    const drills = hireStore.getAllCases()
      .filter(c => c.drill && c.status !== 'closed' && /^D\d+$/.test(String(c.ticketId)))
      .sort((a, b) => Number(String(b.ticketId).slice(1)) - Number(String(a.ticketId).slice(1)));

    // Drills started before names were saved: look them up once (quickly,
    // autocomplete only gets 3 seconds) and remember them for next time.
    const missing = drills.filter(c => !c.traineeName).slice(0, 25);
    await Promise.all(missing.map(async c => {
      const user = interaction.client.users.cache.get(c.traineeId)
        || await Promise.race([
          interaction.client.users.fetch(c.traineeId).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 1500)),
        ]);
      if (user) {
        c.traineeName = user.username;
        hireStore.updateCase(c.ticketId, { traineeName: user.username });
      }
    }));

    const choices = drills
      .map(c => {
        const name = c.traineeName || 'unknown trainee';
        return { name: `${c.ticketId} - ${name}`.slice(0, 100), value: Number(String(c.ticketId).slice(1)) };
      })
      .filter(choice => choice.name.toLowerCase().includes(typed))
      .slice(0, 25);

    await interaction.respond(choices);
  },

  async execute(interaction, client) {
    if (interaction.guildId !== DRILL_SERVER) {
      return interaction.reply({ content: '❌ This only works in the drill server.', flags: 64 });
    }
    if (!interaction.member.roles.cache.has(SUPERVISOR_ROLE)) {
      return interaction.reply({ content: '❌ Only drill supervisors can reset the drill server.', flags: 64 });
    }
    if (!client.options.intents.has(GatewayIntentBits.GuildMembers)) {
      return interaction.reply({
        content: '❌ I can\'t see the member list, so I can\'t kick anyone. Turn on **Server Members Intent** in the Discord developer portal (Bot tab), then run `d!restart`.',
        flags: 64,
      });
    }

    const number = interaction.options.getInteger('drill');
    const drill = hireStore.getAllCases().find(c => c.drill && String(c.ticketId) === `D${number}`);
    if (!drill) {
      return interaction.reply({ content: `❌ There's no drill D${number}. Drill numbers come from \`/drillstart\`.`, flags: 64 });
    }

    const trainee = await client.users.fetch(drill.traineeId).catch(() => null);
    if (!trainee) {
      return interaction.reply({ content: `❌ I couldn't find the trainee on drill D${number}.`, flags: 64 });
    }

    const guild = interaction.guild;
    const me = guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ I need Administrator in this server to reset it.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    // Work out exactly what will go, and show it before doing anything
    const members = await guild.members.fetch();
    const toKick = members.filter(m => m.id !== me.id && !m.roles.cache.has(SUPERVISOR_ROLE));
    const roles = guild.roles.cache.filter(r =>
      r.id !== guild.id && !r.managed && !KEEP_ROLES.has(r.id));
    const channels = guild.channels.cache.filter(c => !KEEP_CHANNELS.has(c.id));
    const newName = serverName(number, trainee);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('drillreset:go').setLabel('Wipe the server').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('drillreset:stop').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    const prompt = await interaction.editReply({
      embeds: [{
        title: '⚠️ Reset the drill server?',
        color: 0xe74c3c,
        description:
          `Getting the server ready for **D${number}** (<@${trainee.id}>). This cannot be undone.\n\n` +
          `**Kicks** ${toKick.size} member${toKick.size === 1 ? '' : 's'} without the drill supervisor role, bots included\n` +
          `**Deletes** ${roles.size} role${roles.size === 1 ? '' : 's'} and ${channels.size} channel${channels.size === 1 ? '' : 's'} and categories\n` +
          `**Keeps** the supervisor, bot, trainee audit and divider roles, and the temp channel\n` +
          `**Clears** every message in the temp channel except pinned ones\n` +
          `**Renames** the server to **${newName}**`,
      }],
      components: [row],
    });

    const press = await prompt.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 60000,
    }).catch(() => null);

    if (!press || press.customId === 'drillreset:stop') {
      const why = press ? 'Cancelled. Nothing was changed.' : 'No answer in a minute, so nothing was changed.';
      if (press) await press.update({ content: why, embeds: [], components: [] });
      else await interaction.editReply({ content: why, embeds: [], components: [] });
      return;
    }

    await press.update({ content: '🧹 Wiping the drill server...', embeds: [], components: [] });

    // 1. Kick everyone who isn't a supervisor
    let kicked = 0;
    const couldNotKick = [];
    for (const member of toKick.values()) {
      const ok = await member.kick(`Drill server reset for D${number}`).then(() => true).catch(() => false);
      if (ok) kicked += 1; else couldNotKick.push(member.user.tag);
    }

    // 2. Delete channels and categories (channels first, so categories are empty)
    let channelsGone = 0;
    const ordered = [...channels.values()].sort((a, b) => (a.type === 4) - (b.type === 4));
    for (const channel of ordered) {
      const ok = await channel.delete(`Drill server reset for D${number}`).then(() => true).catch(() => false);
      if (ok) channelsGone += 1;
    }

    // 3. Delete roles. Anything above the bot's own role can't be touched.
    let rolesGone = 0;
    for (const role of roles.values()) {
      if (!role.editable) continue;
      const ok = await role.delete(`Drill server reset for D${number}`).then(() => true).catch(() => false);
      if (ok) rolesGone += 1;
    }
    const stuckRoles = roles.size - rolesGone;

    // 4. Empty the temp channel, keeping pinned messages
    const temp = guild.channels.cache.get([...KEEP_CHANNELS][0]);
    const cleared = temp ? await clearChannel(temp) : 0;

    // 5. Name it after the drill
    const renamed = await guild.setName(newName, `Drill server reset for D${number}`).then(() => true).catch(() => false);

    const summary = [
      `✅ Drill server reset for **D${number}** (<@${trainee.id}>).`,
      `Kicked ${kicked} member${kicked === 1 ? '' : 's'}, deleted ${channelsGone} channel${channelsGone === 1 ? '' : 's'} and ${rolesGone} role${rolesGone === 1 ? '' : 's'}, and cleared ${cleared} message${cleared === 1 ? '' : 's'} from the temp channel.`,
      renamed ? `Server is now **${newName}**.` : '⚠️ I couldn\'t rename the server.',
      couldNotKick.length ? `⚠️ Couldn't kick: ${couldNotKick.join(', ')} (the server owner can't be kicked by anyone).` : '',
      stuckRoles ? `⚠️ ${stuckRoles} role${stuckRoles === 1 ? ' sits' : 's sit'} above my role, so I left ${stuckRoles === 1 ? 'it' : 'them'}. Drag my role higher to fix that.` : '',
    ].filter(Boolean).join('\n');

    // The channel this was run in may have just been deleted, so the summary
    // goes to the temp channel as well as back to whoever ran it. It's posted
    // after the clear-out, so it survives it.
    if (temp) await temp.send({ content: summary, allowedMentions: { parse: [] } }).catch(() => {});
    await interaction.editReply({ content: summary }).catch(() => {});
  },
};
