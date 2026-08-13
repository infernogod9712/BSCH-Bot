const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Posts the staff-application panel (SOP Section 4). A member picks a
// department; the bot opens a private application channel and interviews them.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('applypanel')
    .setDescription('Send the staff application panel in this channel (staff only).')
    .setDefaultMemberPermissions(0),

  async execute(interaction, client, config) {
    await interaction.deferReply({ flags: 64 });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app_start_builder').setLabel('🔨 Building').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('app_start_mod').setLabel('🛡️ Moderation').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('app_start_both').setLabel('⭐ Both').setStyle(ButtonStyle.Secondary),
    );

    await interaction.channel.send({
      embeds: [{
        title: '📝 Join the BSCH Staff Team',
        description:
          'Want to help build SCP roleplay servers or moderate the community? Apply below!\n\n' +
          '**🔨 Building** — help design and build servers for clients.\n' +
          '**🛡️ Moderation** — help keep the community safe.\n' +
          '**⭐ Both** — apply for both departments.\n\n' +
          'Pick one and I\'ll open a private channel and ask you a few questions. ' +
          'After you finish, Senior Staff review your answers.',
        color: 0x3498db,
      }],
      components: [row],
    });

    return interaction.editReply({ content: '✅ Application panel sent.' });
  },
};
