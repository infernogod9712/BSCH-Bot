// onboarding/drills.js
// Ending a drill (SOP Section 4). Used by /drillend and by the timer that
// fails a builder drill when no build is submitted before the deadline.

const store = require('./store');
const hireStore = require('../hire/store');
const { deleteCaseVoice } = require('../handlers/hiringhandler');

// result: 'pass' | 'fail'. endedById is null when the bot ends it on a timer.
async function endDrill(guild, drill, result, reason, endedById, config) {
  const member = await guild.members.fetch(drill.traineeId).catch(() => null);
  const deptLabel = drill.department === 'mod' ? 'Moderation' : 'Building';
  const deptRole = drill.department === 'mod' ? config.roles.moderator : config.roles.builder;
  const days = config.timers.drillFailCooldownDays || 7;

  // Builder drills: close the practice hire case and clear up after it
  const drillCase = hireStore.getCaseByChannel(drill.channelId);
  if (drillCase && drillCase.drill) {
    await deleteCaseVoice(guild, drillCase);
    if (drillCase.status !== 'closed') {
      hireStore.updateCase(drillCase.ticketId, {
        status: 'closed', closedAt: new Date().toISOString(), closedBy: endedById, closeReason: `drill-${result}`,
      });
    }
  }

  if (result === 'pass') {
    store.updateDrill(drill.traineeId, { status: 'passed', reason, endedBy: endedById });
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
    store.setCooldown(drill.traineeId, 'drill', Date.now() + days * 24 * 3600 * 1000);
    store.updateDrill(drill.traineeId, { status: 'failed', reason, endedBy: endedById });
    if (member) {
      await member.send({
        embeds: [{
          title: 'Drill Result',
          description: `You didn't pass this drill. Don't worry — you can request another one in **${days} days**. Reason given: ${reason}`,
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
          { name: 'Evaluator', value: endedById ? `<@${endedById}>` : 'Bot (deadline passed)', inline: true },
          { name: 'Reason', value: reason },
        ],
        color: result === 'pass' ? 0x2ecc71 : 0xe74c3c,
        timestamp: new Date().toISOString(),
      }],
    }).catch(() => {});
  }

  // Close the drill channel after a short pause so people can read the result
  const channel = await guild.channels.fetch(drill.channelId).catch(() => null);
  if (channel) setTimeout(() => channel.delete().catch(() => {}), 8000);

  return { deptLabel, days };
}

// Timer: fail builder drills with no build submitted before the deadline.
async function sweepDrills(guild, config) {
  const deadlineDays = config.timers.drillBuildDeadlineDays || 5;
  const drills = Object.values(store.readData().drills || {});
  for (const drill of drills) {
    if (drill.status !== 'in-progress' || drill.department !== 'builder' || drill.buildSubmittedAt) continue;
    const age = Date.now() - new Date(drill.createdAt).getTime();
    if (age < deadlineDays * 24 * 3600 * 1000) continue;

    const channel = await guild.channels.fetch(drill.channelId).catch(() => null);
    if (channel) {
      await channel.send(`⏰ <@${drill.traineeId}> didn't submit a build within ${deadlineDays} days, so this drill has ended as a **fail**. Closing this channel shortly.`).catch(() => {});
    }
    await endDrill(guild, drill, 'fail', `No build submitted within ${deadlineDays} days.`, null, config);
  }
}

module.exports = { endDrill, sweepDrills };
