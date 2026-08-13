const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const store = require('../onboarding/store');
const { buildQuestions } = require('../onboarding/questions');
const { isSenior } = require('./hiringhandler');

// Which apply button maps to which department.
const STARTS = {
  app_start_builder: { dept: 'builder', label: 'Building' },
  app_start_mod:     { dept: 'mod',     label: 'Moderation' },
  app_start_both:    { dept: 'both',    label: 'Building & Moderation' },
};

// ------------------------------------------------------------------
// Button router (customIds starting with "app")
// ------------------------------------------------------------------
async function handle(interaction, client, config) {
  if (interaction.isButton() && STARTS[interaction.customId]) {
    return startApplication(interaction, client, config, STARTS[interaction.customId]);
  }
  if (interaction.isButton() && interaction.customId.startsWith('app_approve:')) {
    return decide(interaction, client, config, 'approve');
  }
  if (interaction.isButton() && interaction.customId.startsWith('app_deny:')) {
    return decide(interaction, client, config, 'deny');
  }
}

// ------------------------------------------------------------------
// Start: make the private application channel and ask question #1
// ------------------------------------------------------------------
async function startApplication(interaction, client, config, choice) {
  const guild = interaction.guild;
  const user = interaction.user;

  // On a deny cooldown?
  const cd = store.getCooldown(user.id, 'apply');
  if (cd) {
    return interaction.reply({
      content: `❌ You applied recently. You can apply again <t:${Math.floor(cd / 1000)}:R>.`,
      flags: 64,
    });
  }

  // Already have one open?
  const existing = store.getApplicationByUser(user.id);
  if (existing) {
    const ch = guild.channels.cache.get(existing.channelId);
    return interaction.reply({
      content: ch ? `❌ You already have an application open: ${ch}.` : '❌ You already have an application in progress.',
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  // Private channel: applicant + Senior Staff (Head Staff and above) only.
  const seniorIds = (config.roles.seniorStaffRoles || []).map(n => config.roles[n]).filter(Boolean);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...seniorIds.map(id => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  const teamSlug = choice.dept === 'both' ? 'both' : choice.dept;
  const channel = await guild.channels.create({
    name: `${teamSlug}-application-${user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, ''),
    type: ChannelType.GuildText,
    parent: config.categories.applications || undefined,
    topic: `Application for ${user.id}`,
    permissionOverwrites: overwrites,
  }).catch(() => null);

  if (!channel) {
    return interaction.editReply({ content: '❌ Could not create your application channel. Please contact staff.' });
  }

  const questions = buildQuestions(choice.dept);
  store.createApplication(user.id, channel.id, choice.dept, questions);

  await channel.send({
    content: `<@${user.id}>`,
    embeds: [{
      title: `📝 ${choice.label} Application`,
      description:
        'Welcome! I\'ll ask a few questions **one at a time**. Just answer each one in a normal message ' +
        'and I\'ll send the next. Take your time.\n\nWhen you\'re done, this channel closes and Senior Staff review your answers.',
      color: 0x3498db,
    }],
  });
  await channel.send({ content: `**Question 1 of ${questions.length}:**\n${questions[0]}` });

  return interaction.editReply({ content: `✅ Your application has started: ${channel}` });
}

// ------------------------------------------------------------------
// Answer flow (called from index.js messageCreate in an app channel)
// ------------------------------------------------------------------
async function handleAnswer(client, config, message) {
  const session = store.getApplicationByChannel(message.channel.id);
  if (!session || session.status !== 'in-progress') return false;
  if (message.author.id !== session.userId) return false; // ignore staff chatter

  const answers = [...session.answers, message.content || '*(no answer)*'];
  const nextStep = session.step + 1;
  store.updateApplication(session.userId, { answers, step: nextStep });

  // More questions left?
  if (nextStep < session.questions.length) {
    await message.channel.send({
      content: `**Question ${nextStep + 1} of ${session.questions.length}:**\n${session.questions[nextStep]}`,
    }).catch(() => {});
    return true;
  }

  // Done -> submit for review and close the channel.
  await message.channel.send({
    embeds: [{
      title: '✅ Application Complete',
      description: 'Thanks! Your answers have been sent to Senior Staff for review. This channel will now close.',
      color: 0x2ecc71,
    }],
  }).catch(() => {});

  await submitApplication(client, config, { ...session, answers });
  setTimeout(() => message.channel.delete().catch(() => {}), 5000);
  return true;
}

// Post the finished Q&A to the application-approval forum with Approve/Deny.
async function submitApplication(client, config, session) {
  store.updateApplication(session.userId, { status: 'submitted' });

  const guild = client.guilds.cache.get(config.guildId);
  const dest = guild ? guild.channels.cache.get(config.channels.applicationApprovalForum) : null;

  const user = await client.users.fetch(session.userId).catch(() => null);
  const tag = user ? user.tag : session.userId;
  const deptLabel = session.department === 'both' ? 'Building & Moderation' : (session.department === 'mod' ? 'Moderation' : 'Building');

  // Full Q&A as a text attachment (reliable regardless of length).
  const qaText = session.questions
    .map((q, i) => `Q${i + 1}. ${q}\nA: ${session.answers[i] || '(no answer)'}`)
    .join('\n\n');
  const file = new AttachmentBuilder(
    Buffer.from(`Application — ${tag} (${deptLabel})\nUSER_ID: ${session.userId}\n\n${qaText}`, 'utf-8'),
    { name: `application-${session.userId}.txt` },
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_approve:${session.userId}:${session.department}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_deny:${session.userId}:${session.department}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
  );

  const summaryEmbed = {
    title: `📝 Application — ${tag}`,
    description: `Applicant: <@${session.userId}>\nDepartment: **${deptLabel}**\nUSER_ID: ${session.userId}`,
    color: 0x3498db,
    footer: { text: 'Full answers attached. Senior Staff: Approve or Deny below.' },
    timestamp: new Date().toISOString(),
  };

  if (!dest) return;

  let thread;
  if (dest.type === ChannelType.GuildForum) {
    thread = await dest.threads.create({
      name: `${deptLabel} — ${tag}`.slice(0, 90),
      message: { embeds: [summaryEmbed], files: [file], components: [row] },
    }).catch(() => null);
  } else {
    const msg = await dest.send({ embeds: [summaryEmbed], files: [file], components: [row] }).catch(() => null);
    if (msg) thread = await msg.startThread({ name: `${deptLabel} — ${tag}`.slice(0, 90) }).catch(() => null);
  }

  // Also drop the Q&A inline, chunked, so reviewers can read without downloading.
  if (thread) {
    for (const chunk of chunk2000(qaText)) {
      await thread.send({ content: chunk, allowedMentions: { parse: [] } }).catch(() => {});
    }
  }
}

// ------------------------------------------------------------------
// Approve / Deny (Senior Staff, from the forum post)
// ------------------------------------------------------------------
async function decide(interaction, client, config, action) {
  if (!isSenior(interaction.member, config)) {
    return interaction.reply({ content: '❌ Only Senior Staff can approve or deny applications.', flags: 64 });
  }

  const [, userId, department] = interaction.customId.split(':');
  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;
  const member = await guild.members.fetch(userId).catch(() => null);

  if (action === 'approve') {
    if (member && config.roles.trainee) {
      await member.roles.add(config.roles.trainee).catch(() => {});
    }
    store.updateApplication(userId, { status: 'approved' });
    if (member) {
      await member.send({
        embeds: [{
          title: '🎉 Application Approved',
          description:
            'Congratulations! You\'ve been accepted as a **Trainee**. A Head Staff member will run you through a ' +
            'drill before you\'re promoted. Use `/drillrequest` when you\'re ready.',
          color: 0x2ecc71,
        }],
      }).catch(() => {});
    }
    await tagDecision(interaction, `✅ Approved by <@${interaction.user.id}>`);
    return interaction.editReply({ content: `✅ Approved <@${userId}> and gave them the Trainee role.` });
  }

  // Deny -> cooldown + notify.
  const days = config.timers.applicationDenyCooldownDays || 14;
  store.setCooldown(userId, 'apply', Date.now() + days * 24 * 3600 * 1000);
  store.updateApplication(userId, { status: 'denied' });
  if (member) {
    await member.send({
      embeds: [{
        title: 'Application Update',
        description: `Thanks for applying to BSCH. Your application wasn\'t accepted this time. You may apply again in **${days} days**.`,
        color: 0x992d22,
      }],
    }).catch(() => {});
  }
  await tagDecision(interaction, `❌ Denied by <@${interaction.user.id}> (${days}-day cooldown applied)`);
  return interaction.editReply({ content: `❌ Denied <@${userId}>. They can reapply in ${days} days.` });
}

// Disable the buttons on the forum post and note who decided.
async function tagDecision(interaction, note) {
  await interaction.message.edit({
    content: note,
    components: [],
  }).catch(() => {});
}

function chunk2000(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 1900) out.push(text.slice(i, i + 1900));
  return out.length ? out : ['(no answers)'];
}

module.exports = { handle, handleAnswer };
