/*
 * ============================================================
 * DISCORD PANEL BOT — SETUP GUIDE
 * ============================================================
 *
 * STEP 1 — Install dependencies
 *   Open a terminal in this folder and run:
 *     npm install
 *
 * STEP 2 — Fill in config.json
 *   Open config.json and replace each placeholder:
 *     "token"              → Your bot token from https://discord.com/developers/applications
 *     "clientId"           → Your bot's Application ID (found on the same page)
 *     "guildId"            → Right-click your Discord server → Copy Server ID
 *     "sendMessageChannelId" → Right-click the channel to send messages to → Copy Channel ID
 *     "clearChannelId"     → Right-click the channel to clear → Copy Channel ID
 *   (To see IDs, enable Developer Mode in Discord Settings → Advanced)
 *
 * STEP 3 — Register the slash command
 *   Run this ONCE before starting the bot:
 *     node deploy-commands.js
 *
 * STEP 4 — Start the bot
 *     node index.js
 *   The web dashboard will be available at http://localhost:3000
 *
 * STEP 5 — Bot permissions required in Discord
 *   When inviting the bot to your server, make sure it has these permissions:
 *     - Send Messages       (to post the panel embed and button responses)
 *     - Read Message History (to fetch messages for bulk delete)
 *     - Manage Messages     (required for bulkDelete to work)
 *   You can set these in the OAuth2 URL Generator at discord.com/developers
 *
 * ============================================================
 */

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const express = require('express');

let config = (() => {
  try {
    return require('./config.json');
  } catch {
    // On Railway, values come from environment variables instead of config.json
    return {
      token: process.env.TOKEN,
      clientId: process.env.CLIENT_ID,
      guildId: process.env.GUILD_ID,
      sendMessageChannelId: process.env.SEND_MESSAGE_CHANNEL_ID,
      clearChannelId: process.env.CLEAR_CHANNEL_ID,
      logChannelId: process.env.LOG_CHANNEL_ID,
      starboard: {
        sourceChannelId: process.env.STARBOARD_SOURCE_CHANNEL_ID,
        featuredChannelId: process.env.STARBOARD_FEATURED_CHANNEL_ID,
        threshold: Number(process.env.STARBOARD_THRESHOLD) || 2,
        countBotStar: process.env.STARBOARD_COUNT_BOT_STAR !== 'false',
        countSelfStar: process.env.STARBOARD_COUNT_SELF_STAR !== 'false',
      },
    };
  }
})();

function saveConfig() {
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const featuredMessages  = new Set();
const recentMemes       = new Set();
const ticketData        = new Map(); // channelId → { userId, categoryKey, status }
const handledInteractions = new Set(); // dedup guard
let memeCache = [];

async function refillMemeCache() {
  try {
    const res  = await fetch('https://meme-api.com/gimme/50');
    const data = await res.json();
    const fresh = data.memes.filter(m => !recentMemes.has(m.postLink) && !m.nsfw);
    memeCache.push(...fresh);
  } catch (e) {
    console.error('Failed to refill meme cache:', e.message);
  }
}

// Holds the active daily reminder interval
let reminderInterval = null;

const REMINDER_TEXT = `# ⏰ Application Reminder!\nApplications are **still open**! If you haven't applied yet, now is your chance.\n\nDon't miss your opportunity — we'd love to have you! 🙌`;
const REMINDER_LINK = `# FORM LINK\n📋 **[Click Here to Apply](https://docs.google.com/forms/d/1pDdaN8ZTD1ogqryG7jXKqQOcRKYCRwkthIlo4ocSp_o/viewform)**`;

async function sendReminder() {
  const ch = await client.channels.fetch(config.sendMessageChannelId);
  await ch.send(REMINDER_TEXT);
  await ch.send(REMINDER_LINK);
}

function startReminder() {
  stopReminder(); // clear any existing interval first
  reminderInterval = setInterval(async () => {
    try {
      await sendReminder();
    } catch (e) {
      console.error('Failed to send daily reminder:', e);
    }
  }, 24 * 60 * 60 * 1000); // every 24 hours
}

function stopReminder() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

const FORM_URL = 'https://docs.google.com/forms/d/1pDdaN8ZTD1ogqryG7jXKqQOcRKYCRwkthIlo4ocSp_o/viewform';

const MESSAGE_OPEN_TEXT = `# 🟢 Applications Are Now Open!\nWe are currently accepting applications. If you're interested in joining, now is your chance!\n\nMake sure to read all instructions carefully before submitting. Good luck to everyone who applies! 🍀`;
const MESSAGE_OPEN_LINK = `# FORM LINK\n📋 **[Click Here to Apply](${FORM_URL})**`;
const MESSAGE_CLOSE = `# 🔴 Applications Are Now Closed!\nThank you to everyone who applied. We are no longer accepting new submissions at this time.\n\nStay tuned for updates on the results. We appreciate your interest! 🙏`;
const MESSAGE_RESULTS = `# 📋 Results Are Coming!\nOur reviewers have finished going through all applications. Results will be posted **below** shortly.\n\nPlease be patient and keep an eye on this channel. 👀`;

// ---------------------------------------------------------------
// Shared action functions — used by both Discord buttons and web API
// ---------------------------------------------------------------
async function actionOpen() {
  const ch = await client.channels.fetch(config.sendMessageChannelId);
  await ch.send(MESSAGE_OPEN_TEXT);
  await ch.send(MESSAGE_OPEN_LINK);
  config.appsOpen = true;
  saveConfig();
  startReminder();
}

async function actionClose() {
  const ch = await client.channels.fetch(config.sendMessageChannelId);
  const messages = await ch.messages.fetch({ limit: 100 });
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const deletable = messages.filter(
    msg => msg.content.includes(FORM_URL) && msg.createdTimestamp > fourteenDaysAgo
  );
  if (deletable.size > 0) await ch.bulkDelete(deletable, true);
  await ch.send(MESSAGE_CLOSE);
  config.appsOpen = false;
  saveConfig();
  stopReminder();
}

async function actionResults() {
  const ch = await client.channels.fetch(config.sendMessageChannelId);
  await ch.send(MESSAGE_RESULTS);
}

// ---------------------------------------------------------------
// Log embed
// ---------------------------------------------------------------
async function sendLog(user, commandLabel) {
  try {
    const logChannel = await client.channels.fetch(config.logChannelId);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const logEmbed = new EmbedBuilder()
      .setTitle('Builders App Command')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Application', value: `<@${client.user.id}>`, inline: false },
        { name: 'Command', value: commandLabel, inline: false }
      )
      .setFooter({
        text: `@${user.username} • Today at ${timeStr}`,
        iconURL: user.displayAvatarURL({ dynamic: true }),
      });

    await logChannel.send({ embeds: [logEmbed] });
  } catch (error) {
    console.error('Failed to send log:', error);
  }
}

// ---------------------------------------------------------------
// Ticket system
// ---------------------------------------------------------------
const TICKET_LOG_CHANNEL = '1498449349850431549';

const TICKET_STAFF_ROLES = [
  '1498134471352778793', // Moderator
  '1498946366326575176', // Senior Mod
  '1498946523768033310', // Head Mod
  '1498134004489130105', // Admin
  '1498419215483277462', // Co Owner
  '1498133594915209257', // Owner
  '1498134740652527737', // Experienced Builder
  '1498134806305964103', // Certified Builder
];

const TICKET_CATEGORIES = [
  {
    id: 'general',
    label: 'General Help',
    emoji: '🌐',
    categoryId: '1498125419088580698',
    welcome: 'Welcome to the General Help Ticket.\nA builder will be by to assist you.\n**Please help them help you by adding any prior info, such as screenshots of the problem.**\n\n*Staff, please do not talk in this ticket unless you are a builder or there is a situation requiring a moderator.*',
  },
  {
    id: 'bothelp',
    label: 'Bot Help',
    emoji: '🤖',
    categoryId: '1498125569248989205',
    welcome: 'Welcome to the Bot Help Ticket.\nA builder will be by to assist you shortly.\n**Please describe the issue and include any error messages or screenshots.**\n\n*Staff, please do not talk in this ticket unless you are a builder or there is a situation requiring a moderator.*',
  },
  {
    id: 'design',
    label: 'Design',
    emoji: '🎨',
    categoryId: '1498125686295101541',
    welcome: 'Welcome to the Design Ticket.\nA designer will be with you shortly.\n**Please describe what you need and provide any references or examples.**\n\n*Staff, please do not talk in this ticket unless you are a builder or there is a situation requiring a moderator.*',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    emoji: '🔧',
    categoryId: '1498125794675785738',
    welcome: 'Welcome to the Engagement Ticket.\nA team member will be with you shortly.\n**Please describe your query or concern in detail.**\n\n*Staff, please do not talk in this ticket unless you are a builder or there is a situation requiring a moderator.*',
  },
];

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return parseInt(match[1]) * multipliers[match[2].toLowerCase()];
}

async function sendTicketLog(action, user, detail, color = 0x5865F2) {
  try {
    const ch  = await client.channels.fetch(TICKET_LOG_CHANNEL);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const embed = new EmbedBuilder()
      .setTitle(action)
      .setColor(color)
      .addFields({ name: 'Details', value: detail })
      .setFooter({
        text: `@${user.username} • Today at ${timeStr}`,
        iconURL: user.displayAvatarURL({ dynamic: true }),
      });

    await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error('Failed to send ticket log:', e.message);
  }
}

// ---------------------------------------------------------------
// Role guard
// ---------------------------------------------------------------
const ALLOWED_ROLES = [
  '1498134004489130105',
  '1498419215483277462',
  '1498133594915209257',
];

function hasAllowedRole(member) {
  return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// ---------------------------------------------------------------
// Promote / Demote config
// ---------------------------------------------------------------
const STAFF_ROLES = [
  { name: 'Moderator',  id: '1498134471352778793' },
  { name: 'Senior Mod', id: '1498946366326575176' },
  { name: 'Head Mod',   id: '1498946523768033310' },
  { name: 'Admin',      id: '1498134004489130105' },
  { name: 'Co Owner',   id: '1498419215483277462' },
];
const OWNER_ROLE    = '1498133594915209257';
const CO_OWNER_ROLE = '1498419215483277462';
const ADMIN_ROLE    = '1498134004489130105';
const PROMO_CHANNEL = '1501379147304272023';

// Returns the highest staff role index the invoker is allowed to assign.
// Owner → 4 (Co Owner), Co Owner → 3 (Admin), Admin → 2 (Head Mod), else → -1
function getMaxAssignableIndex(member) {
  if (member.roles.cache.has(OWNER_ROLE))    return 4;
  if (member.roles.cache.has(CO_OWNER_ROLE)) return 3;
  if (member.roles.cache.has(ADMIN_ROLE))    return 2;
  return -1;
}

// ---------------------------------------------------------------
// Web dashboard (Express)
// ---------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ ...config.starboard, appsOpen: config.appsOpen });
});

app.post('/api/config', (req, res) => {
  const { threshold, countBotStar, countSelfStar } = req.body;
  if (threshold !== undefined) config.starboard.threshold = Number(threshold);
  if (countBotStar !== undefined) config.starboard.countBotStar = Boolean(countBotStar);
  if (countSelfStar !== undefined) config.starboard.countSelfStar = Boolean(countSelfStar);
  saveConfig();
  res.json({ ok: true, starboard: config.starboard });
});

app.post('/api/application', async (req, res) => {
  const { action } = req.body;
  try {
    if (action === 'open') await actionOpen();
    else if (action === 'close') await actionClose();
    else if (action === 'results') await actionResults();
    else if (action === 'remind') await sendReminder();
    else return res.status(400).json({ error: 'Unknown action' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Web action error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------
// Bot ready
// ---------------------------------------------------------------
client.once('clientReady', () => {
  console.log(`Bot is online as ${client.user.tag}`);
  refillMemeCache();
  const server = app.listen(3001, () => console.log('Dashboard running at http://localhost:3001'));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Port 3001 already in use — dashboard unavailable. Kill the old process and restart.');
    }
  });
  if (config.appsOpen) {
    console.log('Apps are open — resuming daily reminder.');
    startReminder();
  }

  // Auto-close inactive tickets every hour
  setInterval(async () => {
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    for (const [channelId, data] of ticketData) {
      if (data.status !== 'open') continue;
      if (!data.lastActivity || Date.now() - data.lastActivity < THREE_DAYS) continue;
      try {
        const channel = await client.channels.fetch(channelId);
        data.status = 'closed';
        await channel.permissionOverwrites.edit(data.userId, { SendMessages: false }).catch(() => {});

        const controlsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📋').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Open').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setEmoji('⛔').setStyle(ButtonStyle.Danger),
        );

        await channel.send({
          content: 'This ticket is being auto-closed for inactivity.',
          embeds: [new EmbedBuilder().setDescription('**Support team ticket controls**').setColor(0x2b2d31)],
          components: [controlsRow],
        });

        await sendTicketLog('🕐 Ticket Auto-Closed', client.user, `Channel: <#${channelId}>\nReason: 3 days inactivity`, 0xFFA500);
      } catch {
        ticketData.delete(channelId);
      }
    }
  }, 60 * 60 * 1000);
});

// ---------------------------------------------------------------
// Interaction handler
// ---------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (handledInteractions.has(interaction.id)) return;
  handledInteractions.add(interaction.id);
  setTimeout(() => handledInteractions.delete(interaction.id), 60_000);

  // /ping — public
  if (interaction.isChatInputCommand() && interaction.commandName === 'ping') {
    await interaction.reply({ content: `🏓 Pong! Latency: **${client.ws.ping}ms**`, ephemeral: true });
    return;
  }

  // /meme — public
  if (interaction.isChatInputCommand() && interaction.commandName === 'meme') {
    await interaction.deferReply();

    if (!memeCache.length) await refillMemeCache();

    if (!memeCache.length) {
      await interaction.editReply('Could not load memes right now. Try again!');
      return;
    }

    const pick = memeCache.shift();
    recentMemes.add(pick.postLink);
    if (recentMemes.size > 100) recentMemes.delete(recentMemes.values().next().value);
    if (memeCache.length < 10) refillMemeCache();

    const memeEmbed = new EmbedBuilder()
      .setTitle(pick.title)
      .setImage(pick.url)
      .setColor(0xFF4500)
      .setFooter({ text: `r/${pick.subreddit} • 👍 ${pick.ups}` })
      .setURL(pick.postLink);
    await interaction.editReply({ embeds: [memeEmbed] });
    return;
  }

  // /serverinfo
  if (interaction.isChatInputCommand() && interaction.commandName === 'serverinfo') {
    const guild = interaction.guild;
    await guild.fetch();
    const owner = await guild.fetchOwner();
    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setColor(0x5865F2)
      .addFields(
        { name: 'Owner',        value: `<@${owner.id}>`,                             inline: true },
        { name: 'Members',      value: `${guild.memberCount}`,                       inline: true },
        { name: 'Channels',     value: `${guild.channels.cache.size}`,               inline: true },
        { name: 'Roles',        value: `${guild.roles.cache.size}`,                  inline: true },
        { name: 'Boost Level',  value: `Level ${guild.premiumTier}`,                 inline: true },
        { name: 'Boosts',       value: `${guild.premiumSubscriptionCount ?? 0}`,     inline: true },
        { name: 'Created',      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: false },
      )
      .setFooter({ text: `ID: ${guild.id}` });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // /membercount
  if (interaction.isChatInputCommand() && interaction.commandName === 'membercount') {
    const guild   = interaction.guild;
    const members = await guild.members.fetch();
    const humans  = members.filter(m => !m.user.bot).size;
    const bots    = members.filter(m => m.user.bot).size;
    const embed   = new EmbedBuilder()
      .setTitle(`👥 ${guild.name} — Member Count`)
      .setColor(0x5865F2)
      .addFields(
        { name: 'Total',  value: `${guild.memberCount}`, inline: true },
        { name: 'Humans', value: `${humans}`,            inline: true },
        { name: 'Bots',   value: `${bots}`,              inline: true },
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // /roles
  if (interaction.isChatInputCommand() && interaction.commandName === 'roles') {
    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `<@&${r.id}>`)
      .join(' ');
    const embed = new EmbedBuilder()
      .setTitle(`Roles in ${interaction.guild.name}`)
      .setDescription(roles || 'No roles found.')
      .setColor(0x5865F2)
      .setFooter({ text: `${interaction.guild.roles.cache.size - 1} roles` });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // /avatar
  if (interaction.isChatInputCommand() && interaction.commandName === 'avatar') {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const embed  = new EmbedBuilder()
      .setTitle(`${target.username}'s Avatar`)
      .setImage(target.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setColor(0x5865F2)
      .setFooter({ text: `ID: ${target.id}` });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // /info
  if (interaction.isChatInputCommand() && interaction.commandName === 'info') {
    const uptime  = process.uptime();
    const hours   = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const embed   = new EmbedBuilder()
      .setTitle(`${client.user.username}`)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x5865F2)
      .addFields(
        { name: 'Ping',    value: `${client.ws.ping}ms`,                          inline: true },
        { name: 'Uptime',  value: `${hours}h ${minutes}m ${seconds}s`,            inline: true },
        { name: 'Servers', value: `${client.guilds.cache.size}`,                  inline: true },
        { name: 'Created', value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`, inline: false },
      )
      .setFooter({ text: `ID: ${client.user.id}` });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── Ticket: open buttons (public — anyone can open a ticket) ──
  const ticketOpenMatch = interaction.isButton() && interaction.customId.match(/^ticket_open_(.+)$/);
  if (ticketOpenMatch) {
    const cat = TICKET_CATEGORIES.find(c => c.id === ticketOpenMatch[1]);
    if (!cat) return;

    // Prevent duplicate open tickets per user
    for (const [chId, data] of ticketData) {
      if (data.userId === interaction.user.id && data.status === 'open') {
        await interaction.reply({ content: `You already have an open ticket! <#${chId}>`, ephemeral: true });
        return;
      }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const guild = interaction.guild;
      const user  = interaction.user;
      const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

      const channel = await guild.channels.create({
        name: `${cat.id}-${safeName}`,
        type: ChannelType.GuildText,
        parent: cat.categoryId,
        permissionOverwrites: [
          { id: guild.id,        deny:  [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
          { id: user.id,         allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ...TICKET_STAFF_ROLES.map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          })),
        ],
      });

      ticketData.set(channel.id, { userId: user.id, categoryKey: cat.id, status: 'open', lastActivity: Date.now() });

      const welcomeEmbed = new EmbedBuilder()
        .setDescription(cat.welcome)
        .setColor(0x5865F2);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      );

      await channel.send({ content: `<@${user.id}> Welcome!`, embeds: [welcomeEmbed], components: [closeRow] });
      await interaction.editReply(`Ticket created! <#${channel.id}>`);
      await sendTicketLog('🎫 Ticket Opened', user, `Channel: <#${channel.id}>\nCategory: ${cat.label}`, 0x238636);
    } catch (e) {
      console.error('Ticket creation error:', e);
      await interaction.editReply(`Failed to create ticket: \`${e.message}\``);
    }
    return;
  }

  // ── Ticket: close (ticket owner or staff can close) ──
  if (interaction.isButton() && interaction.customId === 'ticket_close') {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ content: 'Are you sure you would like to close this ticket?', components: [confirmRow] });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'ticket_close_cancel') {
    await interaction.message.delete();
    return;
  }

  if (interaction.isButton() && interaction.customId === 'ticket_close_confirm') {
    const data = ticketData.get(interaction.channelId);
    await interaction.deferUpdate();

    // Revoke user's send permission
    if (data) {
      data.status = 'closed';
      try {
        await interaction.channel.permissionOverwrites.edit(data.userId, { SendMessages: false });
      } catch (e) { console.error(e); }
    }

    // Remove the confirmation message
    await interaction.message.delete().catch(() => {});

    const controlsEmbed = new EmbedBuilder()
      .setDescription('**Support team ticket controls**')
      .setColor(0x2b2d31);

    const controlsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Open').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setEmoji('⛔').setStyle(ButtonStyle.Danger),
    );

    await interaction.channel.send({
      content: `Ticket Closed by <@${interaction.user.id}>`,
      embeds: [controlsEmbed],
      components: [controlsRow],
    });

    await sendTicketLog('🔒 Ticket Closed', interaction.user, `Channel: <#${interaction.channelId}>`, 0xED4245);
    return;
  }

  if (interaction.isChatInputCommand() || interaction.isButton()) {
    if (!hasAllowedRole(interaction.member)) {
      await interaction.reply({ content: 'You do not have the required role to use this.', ephemeral: true });
      return;
    }
  }

  // /panel
  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    const panelEmbed = new EmbedBuilder()
      .setTitle('📢 SEND APPLICATION MESSAGE')
      .setDescription(
        'Use the buttons below to manage the application process.\n\n' +
        '🟢 **Open** — Announce that applications are open and share the form link.\n' +
        '🔴 **Close** — Announce that applications are no longer being accepted.\n' +
        '📋 **Results** — Notify members that results are about to be posted.'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Each button posts a message to the applications channel.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app_open').setLabel('Open').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('app_close').setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('app_results').setLabel('Results').setStyle(ButtonStyle.Primary),
    );

    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
    await interaction.deleteReply().catch(() => {});
    return;
  }

  // /appstatus
  if (interaction.isChatInputCommand() && interaction.commandName === 'appstatus') {
    const open = config.appsOpen;
    const statusEmbed = new EmbedBuilder()
      .setTitle(open ? '🟢 Applications Are Open' : '🔴 Applications Are Closed')
      .setDescription(open
        ? 'Applications are currently **open**. The form is active and accepting submissions.'
        : 'Applications are currently **closed**. No submissions are being accepted.')
      .setColor(open ? 0x57F287 : 0xED4245)
      .setTimestamp();
    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    return;
  }

  // /remind
  if (interaction.isChatInputCommand() && interaction.commandName === 'remind') {
    try {
      await sendReminder();
      await interaction.reply({ content: `Reminder sent to <#${config.sendMessageChannelId}>!`, ephemeral: true });
      await sendLog(interaction.user, 'Remind');
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: 'Failed to send reminder.', ephemeral: true });
    }
    return;
  }

  // /setthreshold
  if (interaction.isChatInputCommand() && interaction.commandName === 'setthreshold') {
    const value = interaction.options.getInteger('value');
    config.starboard.threshold = value;
    saveConfig();
    await interaction.reply({ content: `⭐ Star threshold set to **${value}**.`, ephemeral: true });
    return;
  }

  // /countbotstar
  if (interaction.isChatInputCommand() && interaction.commandName === 'countbotstar') {
    const enabled = interaction.options.getBoolean('enabled');
    config.starboard.countBotStar = enabled;
    saveConfig();
    await interaction.reply({ content: `Bot star is now **${enabled ? 'counted' : 'ignored'}**.`, ephemeral: true });
    return;
  }

  // /countselfstar
  if (interaction.isChatInputCommand() && interaction.commandName === 'countselfstar') {
    const enabled = interaction.options.getBoolean('enabled');
    config.starboard.countSelfStar = enabled;
    saveConfig();
    await interaction.reply({ content: `Self star is now **${enabled ? 'counted' : 'ignored'}**.`, ephemeral: true });
    return;
  }

  // /result
  if (interaction.isChatInputCommand() && interaction.commandName === 'result') {
    await interaction.deferReply({ ephemeral: true });
    const target  = interaction.options.getUser('user');
    const outcome = interaction.options.getString('outcome');
    const reason  = interaction.options.getString('reason');

    const passed = outcome === 'pass';

    const resultEmbed = new EmbedBuilder()
      .setTitle(passed ? '✅ Application Accepted' : '❌ Application Denied')
      .setColor(passed ? 0x57F287 : 0xED4245)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Applicant', value: `<@${target.id}>`, inline: true },
        { name: 'Decision', value: passed ? '**Pass**' : '**Fail**', inline: true },
        { name: 'Reason', value: reason },
      )
      .setFooter({ text: `Reviewed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    // Send to applications channel
    const appChannel = await client.channels.fetch(config.sendMessageChannelId);
    await appChannel.send({ embeds: [resultEmbed] });

    // DM the applicant
    let dmSent = true;
    try {
      await target.send({ embeds: [resultEmbed] });
    } catch {
      dmSent = false;
    }

    await interaction.editReply(`Result sent to <#${config.sendMessageChannelId}>${dmSent ? ` and DMed to ${target.username}` : `. Could not DM ${target.username} (DMs may be closed)`}.`);
    return;
  }

  // /send
  if (interaction.isChatInputCommand() && interaction.commandName === 'send') {
    await interaction.deferReply({ ephemeral: true });
    const text       = interaction.options.getString('message');
    const target     = interaction.options.getChannel('channel') ?? interaction.channel;
    const attachment = interaction.options.getAttachment('attachment');

    const payload = { content: text };
    if (attachment) payload.files = [attachment.url];

    try {
      await (await client.channels.fetch(target.id)).send(payload);
      await interaction.editReply('Sent message!');
      await sendLog(interaction.user, `Send → #${target.name}`);
    } catch (e) {
      await interaction.editReply(`Failed to send: \`${e.message}\``);
    }
    return;
  }

  // /ticketpanel
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel') {
    const panelEmbed = new EmbedBuilder()
      .setTitle('Ticket Open Panel')
      .setDescription('Please select the support ticket you would like to open.')
      .setColor(0x5865F2);

    const rows = TICKET_CATEGORIES.map(cat =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_open_${cat.id}`)
          .setLabel(cat.label)
          .setEmoji(cat.emoji)
          .setStyle(ButtonStyle.Secondary),
      )
    );

    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.send({ embeds: [panelEmbed], components: rows });
    await interaction.deleteReply().catch(() => {});
    return;
  }

  // ── Ticket: staff controls ──
  if (interaction.isButton() && interaction.customId === 'ticket_transcript') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const sorted   = [...messages.values()].reverse();

      let text = `Ticket Transcript — #${interaction.channel.name}\n`;
      text += `Generated: ${new Date().toLocaleString()}\n`;
      text += '─'.repeat(50) + '\n\n';

      for (const msg of sorted) {
        const time = msg.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        text += `[${time}] ${msg.author.tag}: ${msg.content || '[embed/attachment]'}\n`;
        msg.attachments.forEach(att => { text += `  [Attachment: ${att.url}]\n`; });
      }

      const file    = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: `transcript-${interaction.channel.name}.txt` });
      const logCh   = await client.channels.fetch(TICKET_LOG_CHANNEL);
      await logCh.send({ content: `📋 Transcript for <#${interaction.channelId}>`, files: [file] });
      await interaction.editReply('Transcript sent to the log channel!');
    } catch (e) {
      await interaction.editReply(`Failed: \`${e.message}\``);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
    const data = ticketData.get(interaction.channelId);
    await interaction.deferUpdate();
    if (data) {
      data.status = 'open';
      try {
        await interaction.channel.permissionOverwrites.edit(data.userId, { SendMessages: true, ViewChannel: true });
      } catch (e) { console.error(e); }
    }

    await interaction.message.edit({ components: [] });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    );
    await interaction.channel.send({ content: `🔓 Ticket reopened by <@${interaction.user.id}>`, components: [closeRow] });
    await sendTicketLog(`🔓 Ticket reopened by <@${interaction.user.id}> — <#${interaction.channelId}>`);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    const channelId   = interaction.channelId;
    const channelName = interaction.channel.name;
    await interaction.reply({ content: '🗑️ Deleting ticket in 3 seconds...' });
    await sendTicketLog(`🗑️ Ticket deleted by <@${interaction.user.id}> — #${channelName}`);
    setTimeout(async () => {
      try { ticketData.delete(channelId); await interaction.channel.delete(); } catch (e) { console.error(e); }
    }, 3000);
    return;
  }

  // /giveaway
  if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') {
    const prize       = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners') ?? 1;
    const duration    = parseDuration(durationStr);

    if (!duration) {
      await interaction.reply({ content: 'Invalid duration. Use formats like `30m`, `2h`, `1d`.', ephemeral: true });
      return;
    }

    const endsAt = Math.floor((Date.now() + duration) / 1000);
    const giveawayEmbed = new EmbedBuilder()
      .setTitle('🎉 GIVEAWAY 🎉')
      .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${endsAt}:R>\n\nReact with 🎉 to enter!`)
      .setColor(0xFF73FA)
      .setFooter({ text: `Hosted by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp(Date.now() + duration);

    await interaction.reply({ content: 'Giveaway started!', ephemeral: true });
    const msg = await interaction.channel.send({ embeds: [giveawayEmbed] });
    await msg.react('🎉');

    setTimeout(async () => {
      try {
        const fetched  = await msg.fetch();
        const reaction = fetched.reactions.cache.get('🎉');
        const users    = await reaction.users.fetch();
        const eligible = users.filter(u => !u.bot);

        if (!eligible.size) {
          await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 Giveaway Ended').setDescription(`No valid entries for **${prize}**.`).setColor(0xFF73FA)] });
          return;
        }

        const picked       = eligible.random(Math.min(winnerCount, eligible.size));
        const winners      = Array.isArray(picked) ? picked : [picked];
        const winnerPings  = winners.map(w => `<@${w.id}>`).join(', ');

        await msg.edit({ embeds: [new EmbedBuilder()
          .setTitle('🎉 Giveaway Ended!')
          .setDescription(`**Prize:** ${prize}\n**Winner(s):** ${winnerPings}`)
          .setColor(0xFF73FA)
          .setFooter({ text: `Hosted by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })] });

        await interaction.channel.send(`🎉 Congratulations ${winnerPings}! You won **${prize}**!`);
      } catch (e) { console.error('Giveaway end error:', e); }
    }, duration);
    return;
  }

  // /poll
  if (interaction.isChatInputCommand() && interaction.commandName === 'poll') {
    const question = interaction.options.getString('question');
    const options  = [1, 2, 3, 4].map(n => interaction.options.getString(`option${n}`)).filter(Boolean);
    const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

    const description = options.length
      ? `${question}\n\n${options.map((o, i) => `${numEmojis[i]} ${o}`).join('\n')}`
      : question;

    const pollEmbed = new EmbedBuilder()
      .setTitle('📊 Poll')
      .setDescription(description)
      .setColor(0x5865F2)
      .setFooter({ text: `Poll by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

    await interaction.reply({ content: 'Poll posted!', ephemeral: true });
    const msg = await interaction.channel.send({ embeds: [pollEmbed] });

    const emojis = options.length ? numEmojis.slice(0, options.length) : ['👍', '👎'];
    for (const emoji of emojis) await msg.react(emoji);
    return;
  }

  // /adduser
  if (interaction.isChatInputCommand() && interaction.commandName === 'adduser') {
    if (!ticketData.has(interaction.channelId)) {
      await interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
      return;
    }
    const target = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    await interaction.reply({ content: `Added <@${target.id}> to the ticket.`, ephemeral: true });
    return;
  }

  // /removeuser
  if (interaction.isChatInputCommand() && interaction.commandName === 'removeuser') {
    if (!ticketData.has(interaction.channelId)) {
      await interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
      return;
    }
    const target = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.delete(target.id);
    await interaction.reply({ content: `Removed <@${target.id}> from the ticket.`, ephemeral: true });
    return;
  }

  // /promote and /demote
  if (interaction.isChatInputCommand() && (interaction.commandName === 'promote' || interaction.commandName === 'demote')) {
    const isPromote = interaction.commandName === 'promote';
    const target  = interaction.options.getUser('user');
    const roleId  = interaction.options.getString('role');
    const reason  = interaction.options.getString('reason');

    const maxIdx   = getMaxAssignableIndex(interaction.member);
    const roleEntry = STAFF_ROLES.find(r => r.id === roleId);
    const roleIdx   = STAFF_ROLES.indexOf(roleEntry);

    if (maxIdx === -1) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }
    if (roleIdx > maxIdx) {
      await interaction.reply({ content: `You cannot assign the **${roleEntry.name}** role.`, ephemeral: true });
      return;
    }

    let targetMember;
    try {
      targetMember = await interaction.guild.members.fetch(target.id);
    } catch {
      await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
      return;
    }

    // Swap roles: remove all staff roles, add the new one
    try {
      const currentStaffRoles = STAFF_ROLES.map(r => r.id).filter(id => targetMember.roles.cache.has(id));
      if (currentStaffRoles.length) await targetMember.roles.remove(currentStaffRoles);
      await targetMember.roles.add(roleId);
    } catch (e) {
      await interaction.reply({ content: `Failed to update roles: \`${e.message}\`\n\nMake sure the bot's role is above all staff roles in Server Settings → Roles.`, ephemeral: true });
      return;
    }

    const actionLabel = isPromote ? '⬆️ Staff Promotion' : '⬇️ Staff Demotion';
    const promoEmbed = new EmbedBuilder()
      .setTitle(actionLabel)
      .setColor(isPromote ? 0x57F287 : 0xED4245)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'User',     value: `<@${target.id}>`,  inline: true },
        { name: 'New Role', value: `<@&${roleId}>`,    inline: true },
        { name: 'Reason',   value: reason },
      )
      .setFooter({ text: `By ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    const promoChannel = await client.channels.fetch(PROMO_CHANNEL);
    await promoChannel.send({ embeds: [promoEmbed] });

    await interaction.reply({ content: `${isPromote ? 'Promoted' : 'Demoted'} <@${target.id}> to **${roleEntry.name}**.`, ephemeral: true });
    await sendLog(interaction.user, `${isPromote ? 'Promote' : 'Demote'} → ${roleEntry.name}`);
    return;
  }

  // Buttons
  if (interaction.isButton()) {
    if (interaction.customId === 'app_open') {
      try {
        await actionOpen();
        await interaction.reply({ content: `Applications opened in <#${config.sendMessageChannelId}>!`, ephemeral: true });
        await sendLog(interaction.user, 'Open');
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: 'Something went wrong. Check the bot console.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'app_close') {
      try {
        await actionClose();
        await interaction.reply({ content: `Applications closed.`, ephemeral: true });
        await sendLog(interaction.user, 'Close');
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: 'Something went wrong. Check the bot console.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'app_results') {
      try {
        await actionResults();
        await interaction.reply({ content: `Results message sent to <#${config.sendMessageChannelId}>!`, ephemeral: true });
        await sendLog(interaction.user, 'Results');
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: 'Something went wrong. Check the bot console.', ephemeral: true });
      }
      return;
    }
  }
});

// ---------------------------------------------------------------
// Starboard — auto-react with ⭐ when an image is posted
// ---------------------------------------------------------------
client.on('messageCreate', async (message) => {
  if (ticketData.has(message.channelId) && !message.author.bot) {
    ticketData.get(message.channelId).lastActivity = Date.now();
  }
  if (message.channelId !== config.starboard.sourceChannelId) return;
  if (message.author.bot) return;
  const hasImage = message.attachments.some(att => att.contentType?.startsWith('image/'));
  if (!hasImage) return;
  await message.react('⭐');
});

// ---------------------------------------------------------------
// Starboard — post to featured channel when threshold is reached
// ---------------------------------------------------------------
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (reaction.emoji.name !== '⭐') return;
  if (reaction.message.channelId !== config.starboard.sourceChannelId) return;

  const users = await reaction.users.fetch();
  const starCount = users.filter(u => {
    if (!config.starboard.countSelfStar && u.id === reaction.message.author.id) return false;
    if (!config.starboard.countBotStar && u.id === client.user.id) return false;
    return true;
  }).size;

  if (starCount < config.starboard.threshold) return;
  if (featuredMessages.has(reaction.message.id)) return;

  const msg = reaction.message;
  const image = msg.attachments.find(att => att.contentType?.startsWith('image/'));
  if (!image) return;

  featuredMessages.add(msg.id);

  const postedAt = `<t:${Math.floor(msg.createdTimestamp / 1000)}:f>`;

  const featuredEmbed = new EmbedBuilder()
    .setTitle('⭐ FEATURED SERVER')
    .setDescription(msg.content || null)
    .setImage(image.url)
    .setColor(0xFFD700)
    .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL({ dynamic: true }) })
    .setFooter({ text: `Posted in #${msg.channel.name} • ${postedAt}` })
    .addFields({ name: 'Original', value: `[Jump to message](${msg.url})`, inline: true });

  const featuredChannel = await client.channels.fetch(config.starboard.featuredChannelId);
  await featuredChannel.send({ embeds: [featuredEmbed] });
});

client.on('error', (err) => console.error('Discord client error:', err.message));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err?.message ?? err));

client.login(config.token);
