const { SlashCommandBuilder } = require('discord.js');
const store = require('../onboarding/store');
const { endDrill } = require('../onboarding/drills');
const { isSenior } = require('../handlers/hiringhandler');

// A Head runs /drillend in the drill channel to record Pass/Fail (SOP Section
// 4). Pass auto-promotes the Trainee to the full department role; Fail applies
// a one-week cooldown before they can request another drill.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drillend')
    .setDescription('End the current drill with a Pass or Fail (Head Staff).')
    .addStringOption(o =>
      o.setName('result').setDescription('Drill outcome').setRequired(true)
        .addChoices(
          { name: 'Pass', value: 'pass' },
          { name: 'Fail', value: 'fail' },
        ))
    .addStringOption(o => o.setName('reason').setDescription('Why this result').setRequired(true)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can end a drill.', flags: 64 });
    }

    const drill = store.getDrillByChannel(interaction.channel.id);
    if (!drill || drill.status !== 'in-progress') {
      return interaction.reply({ content: '❌ Run this inside a drill channel that is still in progress.', flags: 64 });
    }

    const result = interaction.options.getString('result');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply();
    const { deptLabel, days } = await endDrill(interaction.guild, drill, result, reason, interaction.user.id, config);

    await interaction.editReply({
      content: result === 'pass'
        ? `✅ <@${drill.traineeId}> **passed** and was promoted to ${deptLabel}. Closing this channel shortly.`
        : `❌ <@${drill.traineeId}> **failed**. A ${days}-day cooldown was applied. Closing this channel shortly.`,
    });
  },
};
