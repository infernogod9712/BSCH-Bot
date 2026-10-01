const { SlashCommandBuilder } = require('discord.js');
const store = require('../hire/store');
const { isSenior, deleteCaseVoice } = require('../handlers/hiringhandler');

// Deletes the channel this is run in, for when an archived ticket shouldn't
// wait out the archive timer. Head Staff and above only.
//
// On a hire ticket it also takes the case's voice channel with it, and closes
// the case if it was still open, otherwise the client could never open another.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete this ticket channel right now (Head Staff).'),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can delete a channel.', flags: 64 });
    }

    const record = store.getCaseByChannel(interaction.channel.id);
    let removedVoice = false;

    if (record) {
      // The stored id first; failing that, the channel by its name, for cases
      // whose voice channel was made before the id was being kept
      const vcId = record.voiceChannelId
        || interaction.guild.channels.cache.find(c => c.name === `hire-vc-${String(record.ticketId).toLowerCase()}`)?.id;
      if (vcId) {
        await deleteCaseVoice(interaction.guild, { ...record, voiceChannelId: vcId });
        removedVoice = true;
      }

      if (record.status !== 'closed') {
        store.updateCase(record.ticketId, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: interaction.user.id,
          closeReason: 'deleted',
        });
      }
    }

    await interaction.reply({
      content: removedVoice
        ? '🗑️ Deleting this channel and its voice channel now.'
        : '🗑️ Deleting this channel now.',
    });
    setTimeout(() => interaction.channel.delete(`Deleted by ${interaction.user.tag}`).catch(() => {}), 2000);
  },
};
