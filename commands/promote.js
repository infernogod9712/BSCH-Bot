const { SlashCommandBuilder } = require('discord.js');
const { RANKS, RANK_LABEL, log, dm } = require('../staff/actions');
const { isSenior } = require('../handlers/hiringhandler');

// Gives someone a rank and announces it. Head Staff and above.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Give a member a staff rank and post it in promotions (Head Staff).')
    .addUserOption(o => o.setName('member').setDescription('Who is being promoted').setRequired(true))
    .addStringOption(o =>
      o.setName('rank').setDescription('The rank they are moving up to').setRequired(true).addChoices(...RANKS))
    .addStringOption(o => o.setName('reason').setDescription('Why they earned it').setRequired(false)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can promote.', flags: 64 });
    }

    const user = interaction.options.getUser('member');
    const rankKey = interaction.options.getString('rank');
    const reason = interaction.options.getString('reason') || 'No reason given.';
    const roleId = config.roles[rankKey];

    if (!roleId) {
      return interaction.reply({ content: `❌ No role set for **${RANK_LABEL[rankKey]}**. Set it with \`/config\`.`, flags: 64 });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ That member isn\'t in this server.', flags: 64 });
    if (member.roles.cache.has(roleId)) {
      return interaction.reply({ content: `❌ <@${user.id}> already has **${RANK_LABEL[rankKey]}**.`, flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const added = await member.roles.add(roleId).then(() => true).catch(() => false);
    if (!added) {
      return interaction.editReply({ content: '❌ I couldn\'t add that role. It\'s probably above my own role in the list.' });
    }
    // Staff ranks also carry the Staff Team role
    if (config.roles.staffTeam && rankKey !== 'member') await member.roles.add(config.roles.staffTeam).catch(() => {});
    if (config.roles.trainee && rankKey !== 'trainee' && rankKey !== 'member') {
      await member.roles.remove(config.roles.trainee).catch(() => {});
    }

    const embed = {
      title: '📈 Promotion',
      color: 0x2ecc71,
      fields: [
        { name: 'Member', value: `<@${user.id}>`, inline: true },
        { name: 'New rank', value: RANK_LABEL[rankKey], inline: true },
        { name: 'Promoted by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason },
      ],
      timestamp: new Date().toISOString(),
    };

    const posted = await log(interaction.guild, config, 'promotionsChannel', embed);
    await dm(member, {
      title: '📈 You were promoted!',
      description: `You're now **${RANK_LABEL[rankKey]}** at BSCH.\n\n**Reason:** ${reason}`,
      color: 0x2ecc71,
    });

    return interaction.editReply({
      content: `✅ <@${user.id}> is now **${RANK_LABEL[rankKey]}**.` +
        (posted ? '' : '\n⚠️ No promotions channel set, so nothing was announced. Set it with `/config`.'),
    });
  },
};
