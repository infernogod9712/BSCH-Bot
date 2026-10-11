const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const BLOCKED_GUILD_ID = '1497625871370944614';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelspurge')
    .setDescription('Delete every channel and category in this server (Administrator).')
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
        content: '❌ Only server administrators can purge channels.',
        flags: 64,
      });
    }

    const guild = interaction.guild;
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: '❌ I need the Manage Channels permission to purge channels.',
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    const channels = await guild.channels.fetch();
    if (!channels.size) {
      return interaction.editReply({ content: 'There are no channels to delete in this server.' });
    }

    const orderedChannels = [...channels.values()].sort((a, b) =>
      Number(a.type === ChannelType.GuildCategory) - Number(b.type === ChannelType.GuildCategory)
    );
    const categories = orderedChannels.filter(channel => channel.type === ChannelType.GuildCategory).length;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('channelspurge:confirm')
        .setLabel('Delete channels')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('channelspurge:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const prompt = await interaction.editReply({
      content:
        `⚠️ This will permanently delete **${channels.size}** channel${channels.size === 1 ? '' : 's'} ` +
        `from **${guild.name}**, including **${categories}** categor${categories === 1 ? 'y' : 'ies'}.`,
      components: [row],
    });
    const press = await prompt.awaitMessageComponent({
      filter: component => component.user.id === interaction.user.id,
      time: 60000,
    }).catch(() => null);

    if (!press || press.customId === 'channelspurge:cancel') {
      const message = press ? 'Cancelled. No channels were deleted.' : 'No confirmation in a minute; no channels were deleted.';
      if (press) await press.update({ content: message, components: [] });
      else await interaction.editReply({ content: message, components: [] });
      return;
    }

    await press.update({ content: '🧹 Deleting channels...', components: [] });

    let deleted = 0;
    const failedChannels = [];
    for (const channel of orderedChannels) {
      try {
        await channel.delete(`Channel purge requested by ${interaction.user.tag}`);
        deleted += 1;
      } catch (error) {
        console.error(`Could not delete channel "${channel.name}" (${channel.id}) in ${guild.id}:`, error);
        failedChannels.push(channel.name);
      }
    }

    const failures = failedChannels.length
      ? `\n⚠️ Could not delete ${failedChannels.length} channel${failedChannels.length === 1 ? '' : 's'}: ` +
        `${failedChannels.slice(0, 10).map(name => `\`${name}\``).join(', ')}` +
        (failedChannels.length > 10 ? `, and ${failedChannels.length - 10} more.` : '.')
      : '';
    return interaction.editReply({
      content:
        `✅ Deleted ${deleted} channel${deleted === 1 ? '' : 's'}.` +
        failures,
    });
  },
};
