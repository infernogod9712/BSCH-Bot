// handlers/referralhandler.js
// Asks people how they found BSCH when they open a hire ticket, a support
// ticket or an application, and keeps the status panel embed up to date.

const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const stats = require('../stats/store');

const BAR_WIDTH = 12;

// Ask once per person. Anyone who already answered is skipped.
async function askIfNew(channel, userId, context) {
  if (stats.hasAnswered(userId)) return false;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`referral_pick:${context}`)
    .setPlaceholder('Pick where you found us')
    .addOptions(Object.entries(stats.SOURCES).map(([value, label]) => ({ label, value })));

  await channel.send({
    content: `<@${userId}>`,
    embeds: [{
      title: '👋 One quick question',
      description: 'How did you find BSCH? It helps us know where to put our effort. You only get asked once.',
      color: 0x3498db,
    }],
    components: [new ActionRowBuilder().addComponents(menu)],
  }).catch(() => {});
  return true;
}

async function handleSelect(interaction, client, config) {
  const context = interaction.customId.split(':')[1] || 'unknown';
  const source = interaction.values[0];

  stats.recordAnswer(interaction.user.id, source, context);
  await interaction.update({
    embeds: [{
      title: '👋 Thanks!',
      description: `You found us through **${stats.SOURCES[source] || source}**.`,
      color: 0x2ecc71,
    }],
    components: [],
  });
  await refreshPanel(interaction.guild, config);
}

function buildPanelEmbed() {
  const { counts, total } = stats.totals();
  const lines = Object.entries(stats.SOURCES).map(([key, label]) => {
    const count = counts[key] || 0;
    const share = total ? count / total : 0;
    const filled = Math.round(share * BAR_WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
    return `\`${bar}\` **${count}** ${label}${total ? ` (${Math.round(share * 100)}%)` : ''}`;
  });

  return {
    title: '📊 How people found BSCH',
    description: lines.join('\n') + `\n\n**${total}** ${total === 1 ? 'person has' : 'people have'} answered.`,
    color: 0x5865f2,
    footer: { text: 'Updates on its own whenever someone answers.' },
    timestamp: new Date().toISOString(),
  };
}

// Re-draw the panel message. Silently does nothing if it was deleted.
async function refreshPanel(guild, config) {
  const { channelId, messageId } = stats.getPanel();
  if (!guild || !channelId || !messageId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildPanelEmbed()] }).catch(() => {});
}

module.exports = { askIfNew, handleSelect, buildPanelEmbed, refreshPanel };
