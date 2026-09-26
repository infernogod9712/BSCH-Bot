const { SlashCommandBuilder } = require('discord.js');
const store = require('../staff/store');
const { log, dm } = require('../staff/actions');
const { isSenior } = require('../handlers/hiringhandler');

// Puts a strike on a staff member's record. Head Staff and above.

const LEVELS = [
  { name: 'Verbal warning', value: 'verbal' },
  { name: 'Written warning', value: 'written' },
  { name: 'Final warning', value: 'final' },
];
const LEVEL_LABEL = Object.fromEntries(LEVELS.map(l => [l.value, l.name]));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Put a warning on a staff member\'s record (Head Staff).')
    .addUserOption(o => o.setName('member').setDescription('Who is being warned').setRequired(true))
    .addStringOption(o =>
      o.setName('level').setDescription('How serious this is').setRequired(true).addChoices(...LEVELS))
    .addStringOption(o => o.setName('reason').setDescription('What happened').setRequired(true)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can file an infraction.', flags: 64 });
    }

    const user = interaction.options.getUser('member');
    const level = interaction.options.getString('level');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ flags: 64 });

    const history = store.addInfraction(user.id, { level, reason, byId: interaction.user.id });
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const posted = await log(interaction.guild, config, 'infractionsChannel', {
      title: '⚠️ Infraction',
      color: 0xe74c3c,
      fields: [
        { name: 'Member', value: `<@${user.id}>`, inline: true },
        { name: 'Level', value: LEVEL_LABEL[level], inline: true },
        { name: 'Filed by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Total on record', value: String(history.length) },
      ],
      timestamp: new Date().toISOString(),
    });

    await dm(member, {
      title: '⚠️ You received an infraction',
      description: `**Level:** ${LEVEL_LABEL[level]}\n**Reason:** ${reason}\n\nThis is on your staff record (${history.length} total). Talk to Head Staff if you think this is wrong.`,
      color: 0xe74c3c,
    });

    return interaction.editReply({
      content: `✅ Infraction filed for <@${user.id}> (${history.length} on record).` +
        (posted ? '' : '\n⚠️ No infractions channel set, so nothing was logged publicly. Set it with `/config`.'),
    });
  },
};
