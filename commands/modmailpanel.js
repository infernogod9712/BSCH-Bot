const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Posts the Mod Mail panel. A member clicks the button, picks a category, and
// then talks to staff through their DMs (SOP Section 7). Members can also just
// DM the bot directly without the panel.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modmailpanel')
    .setDescription('Send the Mod Mail panel in this channel (staff only).')
    .setDefaultMemberPermissions(0),

  async execute(interaction, client, config) {
    await interaction.deferReply({ flags: 64 });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('modmail_open').setLabel('📬 Contact Staff').setStyle(ButtonStyle.Primary),
    );

    await interaction.channel.send({
      embeds: [{
        title: '📬 BSCH Mod Mail',
        description:
          'Use this to **report a member**, **report a staff member**, or **appeal a punishment**.\n\n' +
          'Click the button below (or just DM me directly). Everything you send stays private ' +
          'between you and the staff team.',
        color: 0x5865f2,
      }],
      components: [row],
    });

    return interaction.editReply({ content: '✅ Mod mail panel sent.' });
  },
};
