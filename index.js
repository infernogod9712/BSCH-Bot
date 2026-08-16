// BSCH Bot - fresh start
// Run with: node --env-file=.env index.js
//
// The bot token is read from an environment variable called DISCORD_TOKEN
// so it never gets saved inside the code (safe for a shared GitHub repo).
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const supportHandler = require('./handlers/supporthandler');
const hiringHandler = require('./handlers/hiringhandler');
const modmailHandler = require('./handlers/modmailhandler');
const applicationHandler = require('./handlers/applicationhandler');
const store = require('./hire/store');

// ---- Create the bot ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages, // Mod Mail: members DM the bot
  ],
  // Partials.Channel is required to receive DM events for channels not cached.
  partials: [Partials.Channel, Partials.Message],
});

// ---- Load every command from the commands/ folder ----
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`Skipping ${file} — missing "data" or "execute".`);
  }
}

// ---- Run a command when someone uses one ----
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash command → run the matching command file
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client, config);

    // Button click or modal submit → route to the right handler by customId
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('hire')) {
        await hiringHandler.handle(interaction, client, config);
      } else if (interaction.customId.startsWith('modmail')) {
        await modmailHandler.handle(interaction, client, config);
      } else if (interaction.customId.startsWith('app')) {
        await applicationHandler.handle(interaction, client, config);
      } else {
        await supportHandler.handle(interaction, client, config);
      }
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Something went wrong.', flags: 64 }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Something went wrong.', flags: 64 }).catch(() => {});
      }
    }
  }
});

// ---- Plain messages: mod mail relay + applications + activity + !buildlogs ----
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ---- DMs -> Mod Mail relay (member side) ----
  if (!message.guild) {
    const relayed = await modmailHandler.relayUserDM(client, config, message).catch(() => false);
    if (!relayed) await modmailHandler.showCategoryButtons(message.channel);
    return;
  }

  // ---- Staff replies inside a mod mail thread -> DM the member ----
  if (
    typeof message.channel.isThread === 'function' &&
    message.channel.isThread() &&
    message.channel.parentId === config.channels.modmailChannel
  ) {
    await modmailHandler.relayStaffReply(client, config, message).catch(() => {});
    return;
  }

  // ---- Application answers (applicant typing in their private app channel) ----
  if (config.categories.applications && message.channel.parentId === config.categories.applications) {
    const handled = await applicationHandler.handleAnswer(client, config, message).catch(() => false);
    if (handled) return;
  }

  // ---- b!sync : redeploy slash commands to this server (Senior Staff only) ----
  // Handy when hosting on the Pi so you can sync from Discord instead of the
  // terminal. Guild commands update instantly.
  if (message.content.trim().toLowerCase() === 'b!sync') {
    const seniorIds = [config.roles.owner, config.roles.coOwner, config.roles.admin, config.roles.headStaff].filter(Boolean);
    const allowed = seniorIds.some(id => message.member.roles.cache.has(id));
    if (!allowed) return message.reply('❌ Only Senior Staff can sync commands.').catch(() => {});

    const status = await message.reply('🔄 Syncing commands to this server...').catch(() => null);
    try {
      const body = [...client.commands.values()].map(c => c.data.toJSON());
      const rest = new REST().setToken(process.env.DISCORD_TOKEN);
      const clientId = process.env.CLIENT_ID || client.user.id;
      await rest.put(Routes.applicationGuildCommands(clientId, message.guild.id), { body });
      const msg = `✅ Synced ${body.length} commands to this server.`;
      if (status) await status.edit(msg).catch(() => {}); else await message.reply(msg).catch(() => {});
    } catch (e) {
      console.error('b!sync failed:', e);
      const msg = '❌ Sync failed — check the console for details.';
      if (status) await status.edit(msg).catch(() => {}); else await message.reply(msg).catch(() => {});
    }
    return;
  }

  // Track the client's activity in their hire ticket (for inactivity pings)
  const record = store.getCaseByChannel(message.channel.id);
  if (record && message.author.id === record.clientId) {
    store.updateCase(record.ticketId, {
      lastClientMessageAt: new Date().toISOString(),
      inactivityPinged: false,
    });
  }

  // !buildlogs @client  — pull a client's full case history (staff only)
  if (message.content.trim().toLowerCase().startsWith('!buildlogs')) {
    const isStaff = (config.staffRoles || []).some(id => message.member.roles.cache.has(id));
    if (!isStaff) return message.reply('❌ Only staff can use `!buildlogs`.').catch(() => {});

    const mentioned = message.mentions.users.first();
    const parts = message.content.trim().split(/\s+/);
    const clientId = mentioned ? mentioned.id : (parts[1] ? parts[1].replace(/\D/g, '') : null);
    if (!clientId) return message.reply('Usage: `!buildlogs @client`').catch(() => {});

    const cases = store.getAllCasesByClient(clientId);
    if (!cases.length) return message.reply(`No hire cases found for <@${clientId}>.`).catch(() => {});

    const lines = cases.map(c => {
      const server = c.paperwork && c.paperwork.serverName ? ` — ${c.paperwork.serverName}` : '';
      const rating = c.rating && !c.rating.declined ? ` — ⭐${c.rating.score}/10` : '';
      return `**#${c.ticketId}** — ${c.status}${server}${rating}`;
    });

    await message.reply({
      embeds: [{
        title: `📚 Build history for this client`,
        description: `<@${clientId}>\n\n${lines.join('\n')}`.slice(0, 4000),
        color: 0x3498db,
      }],
    }).catch(() => {});
  }
});

// ---- Timer sweep: claim 24h/48h + client inactivity (Section 1, Step 2) ----
const HOUR_MS = 3600 * 1000;

async function sweepCases() {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    const now = Date.now();

    for (const record of store.getAllCases()) {
      if (record.status === 'closed' || !record.channelId) continue;

      // Unclaimed claim timers
      if (!record.lead && record.status === 'open') {
        const age = now - new Date(record.createdAt).getTime();

        // 48h total -> apologize to the client and close the case
        if (age >= (config.timers.claimAutoCloseHours || 48) * HOUR_MS) {
          const ch = await guild.channels.fetch(record.channelId).catch(() => null);
          if (ch) {
            await ch.send(
              `<@${record.clientId}> We're really sorry — no builder was able to pick up your request in time. ` +
              `Please open a new hire ticket later and we'll try again. 💛`
            ).catch(() => {});
          }
          await hiringHandler.closeCaseChannel(guild, record, null, 'unclaimed-timeout', config);
          continue;
        }

        // 24h -> ping all builders once
        if (age >= (config.timers.claimPingHours || 24) * HOUR_MS && !record.claimPinged) {
          const ch = await guild.channels.fetch(record.channelId).catch(() => null);
          if (ch) {
            const builderMention = config.roles.builder ? `<@&${config.roles.builder}>` : 'Builders';
            await ch.send(
              `${builderMention} — this case has been unclaimed for ${config.timers.claimPingHours || 24}h. Can someone claim it?`
            ).catch(() => {});
          }
          store.updateCase(record.ticketId, { claimPinged: true });
          continue;
        }
      }

      // Client inactivity during an active build
      if (record.status === 'build-started') {
        const last = record.lastClientMessageAt
          ? new Date(record.lastClientMessageAt).getTime()
          : new Date(record.createdAt).getTime();
        if (now - last >= (config.timers.clientInactivityHours || 24) * HOUR_MS && !record.inactivityPinged) {
          const ch = await guild.channels.fetch(record.channelId).catch(() => null);
          if (ch) {
            await ch.send(
              `<@${record.clientId}> just checking in — are you still available to continue your build? ` +
              `Let us know so we can keep things moving. 🙂`
            ).catch(() => {});
          }
          store.updateCase(record.ticketId, { inactivityPinged: true });
        }
      }
    }
  } catch (e) {
    console.error('sweepCases error:', e);
  }
}

// This runs once, when the bot successfully logs in
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  // Check the timers every 15 minutes (first run shortly after startup)
  setTimeout(sweepCases, 30 * 1000);
  setInterval(sweepCases, 15 * 60 * 1000);
});

// ---- Start the bot ----
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('No DISCORD_TOKEN found. Set it before running the bot.');
  process.exit(1);
}

client.login(token);
