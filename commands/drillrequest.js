const { SlashCommandBuilder } = require('discord.js');
const store = require('../onboarding/store');

// A Trainee who is ready runs /drillrequest to ping all Heads (SOP Section 4).

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drillrequest')
    .setDescription('Ask a Head Staff member to run your training drill (Trainee).')
    .addUserOption(o =>
      o.setName('trainee').setDescription('The trainee requesting a drill (defaults to you)').setRequired(false)),

  async execute(interaction, client, config) {
    const trainee = interaction.options.getUser('trainee') || interaction.user;

    // Only Trainees (or staff requesting on a trainee's behalf) should use this.
    const isTrainee = config.roles.trainee && interaction.member.roles.cache.has(config.roles.trainee);
    const isStaff = (config.staffRoles || []).some(id => interaction.member.roles.cache.has(id));
    if (!isTrainee && !isStaff) {
      return interaction.reply({ content: '❌ Only Trainees can request a drill.', flags: 64 });
    }

    // Fail cooldown?
    const cd = store.getCooldown(trainee.id, 'drill');
    if (cd) {
      return interaction.reply({
        content: `❌ <@${trainee.id}> can request another drill <t:${Math.floor(cd / 1000)}:R>.`,
        flags: 64,
      });
    }

    const headPing = config.roles.headStaff ? `<@&${config.roles.headStaff}>` : 'Head Staff';
    const request = {
      content: headPing,
      embeds: [{
        title: '🎯 Drill Requested',
        description: `<@${trainee.id}> is ready for their training drill. A Head can start it with \`/drillstart\`.`,
        color: 0xf1c40f,
        timestamp: new Date().toISOString(),
      }],
      allowedMentions: { roles: config.roles.headStaff ? [config.roles.headStaff] : [] },
    };

    // Post the request in the drill request channel; fall back to replying here
    const requestChannel = interaction.guild.channels.cache.get(config.channels.drillRequestChannel);
    if (!requestChannel) return interaction.reply(request);

    const sent = await requestChannel.send(request).catch(() => null);
    if (!sent) {
      return interaction.reply({ content: '❌ Could not post in the drill request channel. Ask a Head to check the bot\'s permissions there.', flags: 64 });
    }
    await interaction.reply({ content: `✅ Drill request sent to ${requestChannel}. A Head will pick it up.`, flags: 64 });
  },
};
