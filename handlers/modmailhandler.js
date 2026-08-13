const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const store = require('../modmail/store');

// The three things Mod Mail is for (SOP Section 7).
const CATEGORIES = {
  modmail_cat_member: { slug: 'member', label: 'Report a Member' },
  modmail_cat_staff:  { slug: 'staff',  label: 'Report a Staff Member' },
  modmail_cat_appeal: { slug: 'appeal', label: 'Appeal a Punishment' },
};

// The row of category buttons a member picks from (shown in their DMs or from
// the /modmailpanel button).
function categoryRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modmail_cat_member').setLabel('Report a Member').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('modmail_cat_staff').setLabel('Report a Staff Member').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('modmail_cat_appeal').setLabel('Appeal a Punishment').setStyle(ButtonStyle.Secondary),
  );
}

// Sent to a member who DMs the bot with nothing open yet.
async function showCategoryButtons(dmChannel) {
  await dmChannel.send({
    embeds: [{
      title: '📬 BSCH Mod Mail',
      description:
        'What do you need? Pick one below, then just type your message here and ' +
        'our staff team will reply in this DM.',
      color: 0x5865f2,
    }],
    components: [categoryRow()],
  }).catch(() => {});
}

// ------------------------------------------------------------------
// Button router (called from index.js for customIds starting with "modmail")
// ------------------------------------------------------------------
async function handle(interaction, client, config) {
  // Panel button -> show the category choices (ephemeral, inside the server)
  if (interaction.isButton() && interaction.customId === 'modmail_open') {
    return interaction.reply({
      content: 'What do you need help with? Pick one:',
      components: [categoryRow()],
      flags: 64,
    });
  }

  // Picked a category (from a DM or from the panel) -> open a session
  if (interaction.isButton() && CATEGORIES[interaction.customId]) {
    return openSession(interaction, client, config, CATEGORIES[interaction.customId]);
  }
}

// ------------------------------------------------------------------
// Open a new mod mail session: make the staff-side thread + save it
// ------------------------------------------------------------------
async function openSession(interaction, client, config, category) {
  const userId = interaction.user.id;

  // Only one open conversation at a time.
  const existing = store.getOpenByUser(userId);
  if (existing) {
    return interaction.reply({
      content: '📬 You already have an open mod mail conversation. Just keep typing here and staff will see it.',
      flags: 64,
    }).catch(() => {});
  }

  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) {
    return interaction.reply({ content: '❌ I could not reach the server. Please try again later.', flags: 64 }).catch(() => {});
  }

  const forum = guild.channels.cache.get(config.channels.modmailChannel);
  if (!forum) {
    return interaction.reply({
      content: '❌ Mod mail is not set up yet (no channel configured). Please contact staff directly.',
      flags: 64,
    }).catch(() => {});
  }

  const username = interaction.user.username.replace(/[^a-z0-9\-]/gi, '').toLowerCase() || 'user';
  const threadName = `${category.slug}-${username}`.slice(0, 90);

  // Staff reports go to Head Staff (SOP): ping them at the top of the thread.
  const headPing =
    category.slug === 'staff' && config.roles.headStaff
      ? `<@&${config.roles.headStaff}> — staff report, Head Staff please handle.`
      : null;

  const starter = {
    content: headPing || undefined,
    embeds: [{
      title: '📬 New Mod Mail',
      description: `<@${userId}> opened a **${category.label}**.\nUSER_ID: ${userId}`,
      color: category.slug === 'staff' ? 0xe74c3c : 0x5865f2,
      footer: { text: 'Reply in this thread to talk to the member. Type !close to end it.' },
      timestamp: new Date().toISOString(),
    }],
  };

  let thread;
  try {
    if (forum.type === ChannelType.GuildForum) {
      thread = await forum.threads.create({ name: threadName, message: starter });
    } else {
      const msg = await forum.send(starter);
      thread = await msg.startThread({ name: threadName });
    }
  } catch (e) {
    console.error('modmail thread create failed:', e);
    return interaction.reply({ content: '❌ Could not open your mod mail. Please try again later.', flags: 64 }).catch(() => {});
  }

  store.open(userId, thread.id, category.slug);

  const confirm = {
    embeds: [{
      title: '📬 Mod Mail Opened',
      description:
        `Your **${category.label}** is open. Type your message here and staff will reply in this DM.\n\n` +
        'When your issue is resolved, staff will close the conversation.',
      color: 0x2ecc71,
    }],
  };

  // Confirm to the member. If they clicked in the server, DM them too so they
  // know replies land in DMs.
  if (interaction.guild) {
    await interaction.reply({ content: '✅ Opened! Check your DMs to continue.', flags: 64 }).catch(() => {});
    await interaction.user.send(confirm).catch(async () => {
      await interaction.followUp({
        content: '⚠️ I could not DM you. Please enable DMs from server members and try again.',
        flags: 64,
      }).catch(() => {});
    });
  } else {
    await interaction.reply(confirm).catch(() => {});
  }
}

// ------------------------------------------------------------------
// Relay: member DM -> staff thread  (called from index.js messageCreate)
// ------------------------------------------------------------------
async function relayUserDM(client, config, message) {
  const session = store.getOpenByUser(message.author.id);
  if (!session) return false; // no open session -> caller shows category buttons

  const guild = client.guilds.cache.get(config.guildId);
  const thread = guild ? await guild.channels.fetch(session.threadId).catch(() => null) : null;
  if (!thread) {
    store.close(message.author.id, null);
    await message.channel.send('⚠️ Your mod mail conversation was closed. DM me again to open a new one.').catch(() => {});
    return true;
  }

  const files = [...message.attachments.values()].map(a => a.url);
  await thread.send({
    content: `**${message.author.tag}:** ${message.content || '*(no text)*'}${files.length ? '\n' + files.join('\n') : ''}`.slice(0, 2000),
    allowedMentions: { parse: [] },
  }).catch(() => {});
  await message.react('📨').catch(() => {});
  return true;
}

// ------------------------------------------------------------------
// Relay: staff thread reply -> member DM  (called from index.js messageCreate)
// ------------------------------------------------------------------
async function relayStaffReply(client, config, message) {
  const session = store.getByThread(message.channel.id);
  if (!session || session.status !== 'open') return false;

  // Messages starting with "!" are staff-only controls, not relayed.
  if (message.content.startsWith('!')) {
    if (message.content.trim().toLowerCase() === '!close') {
      await closeSession(client, session, message.author.id);
      await message.channel.send('🔒 Conversation closed. The member has been notified.').catch(() => {});
    }
    return true;
  }

  const user = await client.users.fetch(session.userId).catch(() => null);
  if (user) {
    const files = [...message.attachments.values()].map(a => a.url);
    await user.send({
      embeds: [{
        author: { name: `${message.author.username} (BSCH Staff)` },
        description: `${message.content || '*(no text)*'}${files.length ? '\n' + files.join('\n') : ''}`.slice(0, 4000),
        color: 0x5865f2,
      }],
    }).catch(() => {});
  }
  await message.react('📤').catch(() => {});
  return true;
}

// Close a session from the staff side and let the member know.
async function closeSession(client, session, closedById) {
  store.close(session.userId, closedById);
  const user = await client.users.fetch(session.userId).catch(() => null);
  if (user) {
    await user.send({
      embeds: [{
        title: '📪 Mod Mail Closed',
        description: 'Your mod mail conversation has been closed by staff. DM me again any time to open a new one.',
        color: 0x992d22,
      }],
    }).catch(() => {});
  }
}

module.exports = { handle, relayUserDM, relayStaffReply, showCategoryButtons, closeSession };
