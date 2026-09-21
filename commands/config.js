const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const configStore = require('../config-store');
const { isSenior } = require('../handlers/hiringhandler');

// /config — one command for every setting. Pick a setting, then give the
// matching channel / role / number / text. Run it with no setting to see
// everything. Changes apply right away, no restart.

const { SETTINGS } = configStore;

function show(type, value) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return '*not set*';
  if (type === 'channel' || type === 'category') return `<#${value}>`;
  if (type === 'role') return `<@&${value}>`;
  if (type === 'roleList') return value.map(id => `<@&${id}>`).join(' ');
  return String(value);
}

function overview(config) {
  const groups = { channels: [], categories: [], roles: [], timers: [], other: [] };
  for (const [key, s] of Object.entries(SETTINGS)) {
    const group = key.includes('.') ? key.split('.')[0] : 'roles';
    const line = `**${s.label}**: ${show(s.type, configStore.getPath(config, key))}`;
    (groups[group] || groups.other).push(line);
  }
  const titles = { channels: 'Channels', categories: 'Categories', roles: 'Roles', timers: 'Timers', other: 'Other' };
  return Object.entries(groups)
    .filter(([, lines]) => lines.length)
    .map(([g, lines]) => ({
      title: `⚙️ ${titles[g]}`,
      description: lines.join('\n').slice(0, 4000),
      color: 0x5865f2,
    }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('See or change the bot\'s channels, roles and timers (Senior Staff).')
    .addStringOption(o =>
      o.setName('setting').setDescription('What to change. Leave empty to see every setting.').setRequired(false).setAutocomplete(true))
    .addChannelOption(o =>
      o.setName('channel').setDescription('The channel or category to use').setRequired(false))
    .addRoleOption(o =>
      o.setName('role').setDescription('The role to use').setRequired(false))
    .addNumberOption(o =>
      o.setName('number').setDescription('The number of hours or days').setRequired(false).setMinValue(0))
    .addStringOption(o =>
      o.setName('text').setDescription('The text or link to use').setRequired(false)),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const matches = Object.entries(SETTINGS)
      .filter(([key, s]) => key.toLowerCase().includes(typed) || s.label.toLowerCase().includes(typed))
      .slice(0, 25)
      .map(([key, s]) => ({ name: s.label.slice(0, 100), value: key }));
    await interaction.respond(matches);
  },

  async execute(interaction, client, config) {
    const allowed = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || isSenior(interaction.member, config);
    if (!allowed) {
      return interaction.reply({ content: '❌ Only Senior Staff can change the bot\'s settings.', flags: 64 });
    }

    const key = interaction.options.getString('setting');
    if (!key) {
      return interaction.reply({ embeds: overview(config), flags: 64 });
    }

    const setting = SETTINGS[key];
    if (!setting) {
      return interaction.reply({ content: '❌ That isn\'t a setting. Start typing in **setting** and pick one from the list.', flags: 64 });
    }

    let value;
    if (setting.type === 'channel' || setting.type === 'category') {
      const ch = interaction.options.getChannel('channel');
      if (!ch) return interaction.reply({ content: `❌ **${setting.label}** needs a **channel** option.`, flags: 64 });
      if (setting.type === 'category' && ch.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: `❌ **${setting.label}** needs a category, not a channel.`, flags: 64 });
      }
      if (setting.type === 'channel' && ch.type === ChannelType.GuildCategory) {
        return interaction.reply({ content: `❌ **${setting.label}** needs a channel, not a category.`, flags: 64 });
      }
      value = ch.id;
    } else if (setting.type === 'role') {
      const role = interaction.options.getRole('role');
      if (!role) return interaction.reply({ content: `❌ **${setting.label}** needs a **role** option.`, flags: 64 });
      value = role.id;
    } else if (setting.type === 'roleList') {
      const role = interaction.options.getRole('role');
      if (!role) return interaction.reply({ content: `❌ **${setting.label}** needs a **role** option.`, flags: 64 });
      const list = [...(configStore.getPath(config, key) || [])];
      value = list.includes(role.id) ? list.filter(id => id !== role.id) : [...list, role.id];
    } else if (setting.type === 'number') {
      value = interaction.options.getNumber('number');
      if (value === null) return interaction.reply({ content: `❌ **${setting.label}** needs a **number** option.`, flags: 64 });
    } else {
      value = interaction.options.getString('text');
      if (value === null) return interaction.reply({ content: `❌ **${setting.label}** needs a **text** option.`, flags: 64 });
    }

    configStore.set(config, key, value);
    return interaction.reply({ content: `✅ **${setting.label}** is now ${show(setting.type, value)}.`, flags: 64 });
  },
};
