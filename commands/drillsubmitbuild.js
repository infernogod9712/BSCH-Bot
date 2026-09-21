const { SlashCommandBuilder } = require('discord.js');
const store = require('../onboarding/store');

// A builder Trainee runs /drillsubmitbuild in their drill channel when their
// practice build is done (SOP Section 4). The Head reviews it and grades it
// with /drillend. Without a submission the drill fails after the deadline.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drillsubmitbuild')
    .setDescription('Hand in your drill build so the Head can grade it (builder Trainee).')
    .addStringOption(o =>
      o.setName('link').setDescription('Invite link to the server you built').setRequired(true))
    .addStringOption(o =>
      o.setName('notes').setDescription('Anything the Head should know about your build').setRequired(false)),

  async execute(interaction, client, config) {
    const drill = store.getDrillByChannel(interaction.channel.id);
    if (!drill || drill.status !== 'in-progress') {
      return interaction.reply({ content: '❌ Run this inside your drill channel.', flags: 64 });
    }
    if (drill.department !== 'builder') {
      return interaction.reply({ content: '❌ Only builder drills hand in a build.', flags: 64 });
    }
    if (interaction.user.id !== drill.traineeId) {
      return interaction.reply({ content: '❌ Only the trainee can hand in the build.', flags: 64 });
    }

    const link = interaction.options.getString('link');
    const notes = interaction.options.getString('notes') || '';
    const resubmit = Boolean(drill.buildSubmittedAt);

    store.updateDrill(drill.traineeId, {
      buildSubmittedAt: new Date().toISOString(),
      buildLink: link,
      buildNotes: notes,
    });

    await interaction.reply({
      content: `<@${drill.headId}>`,
      embeds: [{
        title: resubmit ? '🏗️ Drill Build Updated' : '🏗️ Drill Build Submitted',
        description:
          `<@${drill.traineeId}> handed in their build.\n\n**Server:** ${link}` +
          (notes ? `\n**Notes:** ${notes}` : '') +
          `\n\nHead, look over the server and grade it with \`/drillend\`.`,
        color: 0xf1c40f,
        timestamp: new Date().toISOString(),
      }],
      allowedMentions: { users: [drill.headId] },
    });
  },
};
