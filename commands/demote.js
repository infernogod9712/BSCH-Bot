const { SlashCommandBuilder } = require('discord.js');
const { RANKS, RANK_LABEL, log, dm } = require('../staff/actions');
const { isSenior } = require('../handlers/hiringhandler');

// Takes a rank away and announces it. Head Staff and above.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Take a staff rank away from a member (Head Staff).')
    .addUserOption(o => o.setName('member').setDescription('Who is being demoted').setRequired(true))
    .addStringOption(o =>
      o.setName('rank').setDescription('The rank they are losing').setRequired(true).addChoices(...RANKS))
    .addStringOption(o => o.setName('reason').setDescription('Why').setRequired(true)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can demote.', flags: 64 });
    }

    const user = interaction.options.getUser('member');
    const rankKey = interaction.options.getString('rank');
    const reason = interaction.options.getString('reason');
    const roleId = config.roles[rankKey];

    if (!roleId) {
      return interaction.reply({ content: `❌ No role set for **${RANK_LABEL[rankKey]}**. Set it with \`/config\`.`, flags: 64 });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ That member isn\'t in this server.', flags: 64 });
    if (!member.roles.cache.has(roleId)) {
      return interaction.reply({ content: `❌ <@${user.id}> doesn't have **${RANK_LABEL[rankKey]}**.`, flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const removed = await member.roles.remove(roleId).then(() => true).catch(() => false);
    if (!removed) {
      return interaction.editReply({ content: '❌ I couldn\'t remove that role. It\'s probably above my own role in the list.' });
    }

    const embed = {
      title: '📉 Demotion',
      color: 0xe67e22,
      fields: [
        { name: 'Member', value: `<@${user.id}>`, inline: true },
        { name: 'Rank removed', value: RANK_LABEL[rankKey], inline: true },
        { name: 'Demoted by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason },
      ],
      timestamp: new Date().toISOString(),
    };

    const posted = await log(interaction.guild, config, 'promotionsChannel', embed);
    await dm(member, {
      title: '📉 Rank change',
      description: `Your **${RANK_LABEL[rankKey]}** rank at BSCH was removed.\n\n**Reason:** ${reason}`,
      color: 0xe67e22,
    });

    return interaction.editReply({
      content: `✅ <@${user.id}> is no longer **${RANK_LABEL[rankKey]}**.` +
        (posted ? '' : '\n⚠️ No promotions channel set, so nothing was announced. Set it with `/config`.'),
    });
  },
};
