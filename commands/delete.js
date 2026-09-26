const { SlashCommandBuilder } = require('discord.js');
const { isSenior } = require('../handlers/hiringhandler');

// Deletes the channel this is run in, for when an archived ticket shouldn't
// wait out the archive timer. Head Staff and above only.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete this ticket channel right now (Head Staff).'),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can delete a channel.', flags: 64 });
    }

    await interaction.reply({ content: '🗑️ Deleting this channel now.' });
    setTimeout(() => interaction.channel.delete(`Deleted by ${interaction.user.tag}`).catch(() => {}), 2000);
  },
};
