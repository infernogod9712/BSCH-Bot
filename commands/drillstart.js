const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../onboarding/store');
const hireStore = require('../hire/store');
const { isSenior } = require('../handlers/hiringhandler');

// A Head runs /drillstart to spin up a simulated scenario ticket for a Trainee
// (SOP Section 4). Builder trainees get a mock hiring case, Moderation trainees
// a mock moderation scenario. The running Head is the evaluator.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drillstart')
    .setDescription('Start a training drill for a Trainee (Head Staff).')
    .addStringOption(o =>
      o.setName('department').setDescription('Which scenario to drill').setRequired(true)
        .addChoices(
          { name: 'Building', value: 'builder' },
          { name: 'Moderation', value: 'mod' },
        ))
    .addUserOption(o => o.setName('trainee').setDescription('The Trainee being drilled').setRequired(true))
    .addUserOption(o => o.setName('client').setDescription('Staff member role-playing the client').setRequired(true))
    .addStringOption(o => o.setName('helpers').setDescription('Other staff helping (mention them)').setRequired(false)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can start a drill.', flags: 64 });
    }

    const department = interaction.options.getString('department');
    const trainee = interaction.options.getUser('trainee');
    const roleplayClient = interaction.options.getUser('client');
    const helpersRaw = interaction.options.getString('helpers') || '';
    const helperIds = [...helpersRaw.matchAll(/(\d{15,25})/g)].map(m => m[1]);

    if (store.getDrillByUser(trainee.id)) {
      return interaction.reply({ content: `❌ <@${trainee.id}> already has a drill in progress.`, flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const guild = interaction.guild;
    const teamSlug = department === 'mod' ? 'mod' : 'builder';

    // Who can see the drill: the evaluating Head, trainee, client, helpers, Senior Staff.
    const seniorIds = (config.roles.seniorStaffRoles || []).map(n => config.roles[n]).filter(Boolean);
    const memberAllows = [interaction.user.id, trainee.id, roleplayClient.id, ...helperIds];
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...memberAllows.map(id => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      })),
      ...seniorIds.map(id => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      })),
    ];

    const channel = await guild.channels.create({
      name: `${teamSlug}-drill-${trainee.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, ''),
      type: ChannelType.GuildText,
      parent: config.categories.drills || undefined,
      topic: `Drill for ${trainee.id}`,
      permissionOverwrites: overwrites,
    }).catch(() => null);

    if (!channel) {
      return interaction.editReply({ content: '❌ Could not create the drill channel.' });
    }

    store.createDrill(trainee.id, {
      channelId: channel.id,
      department,
      headId: interaction.user.id,
      clientId: roleplayClient.id,
      helperIds,
    });

    const scenario = department === 'mod'
      ? 'a simulated **moderation** scenario — handle it like a real incident.'
      : 'a simulated **hiring case** — run it through the Hiring SOP like a real build.';

    // Builder drills run as a practice hire case in this channel
    const drillCase = department === 'builder'
      ? hireStore.createCase({
          drill: true,
          traineeId: trainee.id,
          headId: interaction.user.id,
          clientId: roleplayClient.id,
          channelId: channel.id,
        })
      : null;

    const intakeRow = drillCase
      ? [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hire_drill_intake').setLabel('📝 Fill in the hire form').setStyle(ButtonStyle.Primary),
        )]
      : [];

    const intro = await channel.send({
      content: drillCase ? `<@${trainee.id}> <@${roleplayClient.id}>` : `<@${trainee.id}>`,
      components: intakeRow,
      embeds: [{
        title: `🎯 ${teamSlug === 'mod' ? 'Moderation' : 'Building'} Drill`,
        description:
          `This is a training drill, **not a real case**.\n\n` +
          `**Trainee:** <@${trainee.id}>\n` +
          `**Evaluator (Head):** <@${interaction.user.id}>\n` +
          `**Client (role-play):** <@${roleplayClient.id}>\n` +
          (helperIds.length ? `**Helpers:** ${helperIds.map(id => `<@${id}>`).join(', ')}\n` : '') +
          `\nScenario: ${scenario}\n\n` +
          (drillCase
            ? `<@${roleplayClient.id}>, press **Fill in the hire form** below to start the case, just like a real client would.\n\n`
            : '') +
          `When finished, the Head runs \`/drillend\`.`,
        color: 0xf1c40f,
        timestamp: new Date().toISOString(),
      }],
    });

    if (drillCase) hireStore.updateCase(drillCase.ticketId, { intakePromptMessageId: intro.id });

    return interaction.editReply({ content: `✅ Drill started: ${channel}` });
  },
};
