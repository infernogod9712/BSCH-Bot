const { SlashCommandBuilder } = require('discord.js');
const store = require('../staff/store');
const { staffRoleIds, log, dm } = require('../staff/actions');
const { isSenior } = require('../handlers/hiringhandler');

// Removes someone from the team for good: every staff role comes off and they
// go back to Member. Head Staff and above.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fire')
    .setDescription('Remove a member from the staff team for good (Head Staff).')
    .addUserOption(o => o.setName('member').setDescription('Who is being removed').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Why').setRequired(true)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can remove a staff member.', flags: 64 });
    }

    const user = interaction.options.getUser('member');
    const reason = interaction.options.getString('reason');

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ That member isn\'t in this server.', flags: 64 });

    await interaction.deferReply({ flags: 64 });

    const toRemove = staffRoleIds(config).filter(id => member.roles.cache.has(id));
    if (!toRemove.length) {
      return interaction.editReply({ content: `❌ <@${user.id}> isn't on the staff team.` });
    }

    let failed = 0;
    for (const id of toRemove) {
      const ok = await member.roles.remove(id).then(() => true).catch(() => false);
      if (!ok) failed += 1;
    }
    if (config.roles.member) await member.roles.add(config.roles.member).catch(() => {});

    // A fired member has no suspension left to serve
    store.clearSuspension(user.id);
    store.addInfraction(user.id, { level: 'fired', reason, byId: interaction.user.id });

    const posted = await log(interaction.guild, config, 'infractionsChannel', {
      title: '🚪 Removed from staff',
      color: 0x992d22,
      fields: [
        { name: 'Member', value: `<@${user.id}>`, inline: true },
        { name: 'Removed by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason },
      ],
      timestamp: new Date().toISOString(),
    });

    await dm(member, {
      title: '🚪 You were removed from the BSCH staff team',
      description: `**Reason:** ${reason}\n\nYou're still welcome in the server as a member. If you think this was a mistake, contact Head Staff through mod mail.`,
      color: 0x992d22,
    });

    return interaction.editReply({
      content: `✅ <@${user.id}> removed from staff (${toRemove.length - failed} role(s) removed).` +
        (failed ? `\n⚠️ ${failed} role(s) wouldn't come off — they sit above my own role in the list.` : '') +
        (posted ? '' : '\n⚠️ No infractions channel set, so nothing was logged. Set it with `/config`.'),
    });
  },
};
