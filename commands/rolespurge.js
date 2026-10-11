const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const BLOCKED_GUILD_ID = '1497625871370944614';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolespurge')
    .setDescription('Delete every deletable role in this server (Administrator).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.guild || interaction.guildId === BLOCKED_GUILD_ID) {
      return interaction.reply({
        content: '❌ This command cannot be used in this server.',
        flags: 64,
      });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Only server administrators can purge roles.',
        flags: 64,
      });
    }

    const guild = interaction.guild;
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: '❌ I need the Manage Roles permission to purge roles.',
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    const roles = await guild.roles.fetch();
    const purgeableRoles = roles.filter(role =>
      role.id !== guild.id && !role.managed
    );
    if (!purgeableRoles.size) {
      return interaction.editReply({ content: 'There are no deletable roles in this server.' });
    }

    const editableCount = purgeableRoles.filter(role => role.editable).size;
    const blockedCount = purgeableRoles.size - editableCount;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rolespurge:confirm')
        .setLabel('Delete roles')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('rolespurge:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const prompt = await interaction.editReply({
      content:
        `⚠️ This will permanently delete **${editableCount}** role${editableCount === 1 ? '' : 's'} ` +
        `from **${guild.name}**.` +
        (blockedCount
          ? `\n${blockedCount} role${blockedCount === 1 ? '' : 's'} above my highest role cannot be deleted.`
          : '') +
        '\nThe @everyone role and managed integration/bot roles are not deletable.',
      components: [row],
    });
    const press = await prompt.awaitMessageComponent({
      filter: component => component.user.id === interaction.user.id,
      time: 60000,
    }).catch(() => null);

    if (!press || press.customId === 'rolespurge:cancel') {
      const message = press ? 'Cancelled. No roles were deleted.' : 'No confirmation in a minute; no roles were deleted.';
      if (press) await press.update({ content: message, components: [] });
      else await interaction.editReply({ content: message, components: [] });
      return;
    }

    await press.update({ content: '🧹 Deleting roles...', components: [] });

    let deleted = 0;
    const failedRoles = [];
    for (const role of purgeableRoles.values()) {
      if (!role.editable) continue;
      try {
        await role.delete(`Role purge requested by ${interaction.user.tag}`);
        deleted += 1;
      } catch (error) {
        console.error(`Could not delete role "${role.name}" (${role.id}) in ${guild.id}:`, error);
        failedRoles.push(role.name);
      }
    }

    const failures = failedRoles.length
      ? `\n⚠️ Could not delete ${failedRoles.length} role${failedRoles.length === 1 ? '' : 's'}: ` +
        `${failedRoles.slice(0, 10).map(name => `\`${name}\``).join(', ')}` +
        (failedRoles.length > 10 ? `, and ${failedRoles.length - 10} more.` : '.')
      : '';
    return interaction.editReply({
      content:
        `✅ Deleted ${deleted} role${deleted === 1 ? '' : 's'}.` +
        (blockedCount ? `\n⚠️ ${blockedCount} role${blockedCount === 1 ? '' : 's'} are above my highest role.` : '') +
        failures,
    });
  },
};
