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

const featuredMessages = new Set();

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
// Web dashboard (Express)
// ---------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json(config.starboard);
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
client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
  app.listen(3001, () => console.log('Dashboard running at http://localhost:3001'));
});

// ---------------------------------------------------------------
// Interaction handler
// ---------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {

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

    await interaction.reply({ embeds: [panelEmbed], components: [row] });
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

    await interaction.reply({
      content: `Result sent to <#${config.sendMessageChannelId}>${dmSent ? ` and DMed to ${target.username}` : `. Could not DM ${target.username} (DMs may be closed)`}.`,
      ephemeral: true,
    });
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

client.login(config.token);
