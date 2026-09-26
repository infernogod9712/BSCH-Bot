const { SlashCommandBuilder } = require('discord.js');
const store = require('../staff/store');
const { staffRoleIds, log, dm } = require('../staff/actions');
const { isSenior } = require('../handlers/hiringhandler');

// Takes a staff member's roles away for a set number of days. The bot hands
// them back automatically when the time is up. Head Staff and above.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspend')
    .setDescription('Suspend a staff member for a number of days (Head Staff).')
    .addUserOption(o => o.setName('member').setDescription('Who is being suspended').setRequired(true))
    .addNumberOption(o =>
      o.setName('days').setDescription('How many days until their roles come back').setRequired(true).setMinValue(1).setMaxValue(365))
    .addStringOption(o => o.setName('reason').setDescription('Why').setRequired(true)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Head Staff and above can suspend.', flags: 64 });
    }

    const user = interaction.options.getUser('member');
    const days = interaction.options.getNumber('days');
    const reason = interaction.options.getString('reason');

    if (store.getSuspension(user.id)) {
      return interaction.reply({ content: `❌ <@${user.id}> is already suspended.`, flags: 64 });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ That member isn\'t in this server.', flags: 64 });

    await interaction.deferReply({ flags: 64 });

    // Remember exactly which roles were taken, so the right ones come back
    const toRemove = staffRoleIds(config).filter(id => member.roles.cache.has(id));
    if (!toRemove.length) {
      return interaction.editReply({ content: `❌ <@${user.id}> has no staff roles to suspend.` });
    }

    const removed = [];
    for (const id of toRemove) {
      const ok = await member.roles.remove(id).then(() => true).catch(() => false);
      if (ok) removed.push(id);
    }
    if (!removed.length) {
      return interaction.editReply({ content: '❌ I couldn\'t remove their roles. They\'re probably above my own role in the list.' });
    }

    const until = Date.now() + days * 24 * 3600 * 1000;
    store.addSuspension(user.id, { roleIds: removed, until: new Date(until).toISOString(), reason, byId: interaction.user.id });

    const backAt = `<t:${Math.floor(until / 1000)}:F>`;
    const posted = await log(interaction.guild, config, 'infractionsChannel', {
      title: '⏸️ Suspension',
      color: 0xe67e22,
      fields: [
        { name: 'Member', value: `<@${user.id}>`, inline: true },
        { name: 'Length', value: `${days} day${days === 1 ? '' : 's'}`, inline: true },
        { name: 'Suspended by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Roles back', value: backAt },
        { name: 'Reason', value: reason },
      ],
      timestamp: new Date().toISOString(),
    });

    await dm(member, {
      title: '⏸️ You have been suspended',
      description: `Your BSCH staff roles were removed for **${days} day${days === 1 ? '' : 's'}**.\n**Reason:** ${reason}\n\nThey come back on their own ${backAt}.`,
      color: 0xe67e22,
    });

    return interaction.editReply({
      content: `✅ <@${user.id}> suspended for ${days} day${days === 1 ? '' : 's'}. ${removed.length} role(s) removed, back ${backAt}.` +
        (posted ? '' : '\n⚠️ No infractions channel set, so nothing was logged. Set it with `/config`.'),
    });
  },
};
