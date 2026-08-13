const { SlashCommandBuilder } = require('discord.js');
const store = require('../onboarding/store');
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
    if (!drill) {
      return interaction.reply({ content: '❌ Run this inside a drill channel.', flags: 64 });
    }

    const result = interaction.options.getString('result');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply();

    const guild = interaction.guild;
    const member = await guild.members.fetch(drill.traineeId).catch(() => null);
    const deptLabel = drill.department === 'mod' ? 'Moderation' : 'Building';
    const deptRole = drill.department === 'mod' ? config.roles.moderator : config.roles.builder;

    if (result === 'pass') {
      store.updateDrill(drill.traineeId, { status: 'passed', reason, endedBy: interaction.user.id });
      if (member) {
        if (deptRole) await member.roles.add(deptRole).catch(() => {});
        if (config.roles.staffTeam) await member.roles.add(config.roles.staffTeam).catch(() => {});
        if (config.roles.trainee) await member.roles.remove(config.roles.trainee).catch(() => {});
        await member.send({
          embeds: [{
            title: '🎉 Drill Passed',
            description: `Congratulations! You passed your ${deptLabel} drill and are now a full member of the ${deptLabel} department. Welcome aboard!`,
            color: 0x2ecc71,
          }],
        }).catch(() => {});
      }
    } else {
      const days = config.timers.drillFailCooldownDays || 7;
      store.setCooldown(drill.traineeId, 'drill', Date.now() + days * 24 * 3600 * 1000);
      store.updateDrill(drill.traineeId, { status: 'failed', reason, endedBy: interaction.user.id });
      if (member) {
        await member.send({
          embeds: [{
            title: 'Drill Result',
            description: `You didn\'t pass this drill. Don\'t worry — you can request another one in **${days} days**. Reason given: ${reason}`,
            color: 0x992d22,
          }],
        }).catch(() => {});
      }
    }

    // Log the outcome to drill-results.
    const log = guild.channels.cache.get(config.channels.drillResultsChannel);
    if (log) {
      await log.send({
        embeds: [{
          title: `🎯 Drill ${result === 'pass' ? 'Passed ✅' : 'Failed ❌'} — ${deptLabel}`,
          fields: [
            { name: 'Trainee', value: `<@${drill.traineeId}>`, inline: true },
            { name: 'Evaluator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason },
          ],
          color: result === 'pass' ? 0x2ecc71 : 0xe74c3c,
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {});
    }

    await interaction.editReply({
      content: result === 'pass'
        ? `✅ <@${drill.traineeId}> **passed** and was promoted to ${deptLabel}. Closing this channel shortly.`
        : `❌ <@${drill.traineeId}> **failed**. A ${config.timers.drillFailCooldownDays || 7}-day cooldown was applied. Closing this channel shortly.`,
    });

    setTimeout(() => interaction.channel.delete().catch(() => {}), 8000);
  },
};
