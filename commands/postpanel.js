const { SlashCommandBuilder, ChannelType } = require('discord.js');
const panels = require('../stats/panels');
const { buildPanelEmbed } = require('../handlers/referralhandler');
const { buildStatusEmbed } = require('../handlers/statuspanel');
const { isSenior } = require('../handlers/hiringhandler');

// Posts a panel into its home channel, or into a channel you name.
// Add new panels to PANELS and they show up as choices automatically.
//
// tracked: the bot keeps editing this message, so only one may exist at a time.

const PANELS = {
  status: {
    label: 'Live status',
    tracked: true,
    channelKey: 'statusPanelChannel',
    note: 'It refreshes every 15 minutes.',
    build: (config, client, guild) => buildStatusEmbed(client, config, guild),
  },
  referrals: {
    label: 'How people found BSCH',
    tracked: true,
    channelKey: 'statusPanelChannel',
    note: 'It updates itself whenever someone answers.',
    build: () => buildPanelEmbed(),
  },
  sop: {
    label: 'Staff SOP',
    tracked: false,
    channelKey: 'sopChannel',
    build: (config) => {
      const link = config.links && config.links.sopDoc;
      if (!link) return null;
      return {
        title: '📘 BSCH Staff SOP',
        description:
          `**[Read the Staff SOP](${link})**\n\n` +
          'This is the main staff document: how hiring cases run start to finish, how support tickets and moderation work, ' +
          'how onboarding and drills go, and what BSCH expects from you. Trainees get this the moment their application is accepted.',
        color: 0x5865f2,
        footer: { text: 'Keep this handy — it changes as the process changes.' },
      };
    },
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postpanel')
    .setDescription('Post a panel into its channel (Senior Staff).')
    .addStringOption(o =>
      o.setName('panel').setDescription('Which panel to post').setRequired(true)
        .addChoices(...Object.entries(PANELS).map(([value, p]) => ({ name: p.label, value }))))
    .addChannelOption(o =>
      o.setName('channel').setDescription('Post it here instead of its usual channel').setRequired(false)
        .addChannelTypes(ChannelType.GuildText)),

  async execute(interaction, client, config) {
    if (!isSenior(interaction.member, config)) {
      return interaction.reply({ content: '❌ Only Senior Staff can post panels.', flags: 64 });
    }

    const key = interaction.options.getString('panel');
    const panel = PANELS[key];

    // Each panel has a home channel; naming one in the command wins
    const channel = interaction.options.getChannel('channel')
      || interaction.guild.channels.cache.get(config.channels[panel.channelKey])
      || interaction.guild.channels.cache.get(config.channels.statusPanelChannel);

    if (!channel) {
      return interaction.reply({ content: `❌ No home channel set for **${panel.label}**. Set it with \`/config\`, or name a channel in this command.`, flags: 64 });
    }

    const embed = panel.build(config, client, interaction.guild);
    if (!embed) {
      return interaction.reply({ content: '❌ No SOP link saved yet. Add it with `/config` (**Staff SOP document link**).', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    // A live panel only ever exists once, so take down the old copy first
    if (panel.tracked) {
      const old = panels.get(key);
      if (old.messageId && old.channelId) {
        const oldChannel = await interaction.guild.channels.fetch(old.channelId).catch(() => null);
        const oldMessage = oldChannel ? await oldChannel.messages.fetch(old.messageId).catch(() => null) : null;
        if (oldMessage) await oldMessage.delete().catch(() => {});
      }
    }

    const message = await channel.send({ embeds: [embed] }).catch(() => null);
    if (!message) {
      return interaction.editReply({ content: `❌ I couldn't post in ${channel}. Check my permissions there.` });
    }

    if (panel.tracked) panels.set(key, channel.id, message.id);

    return interaction.editReply({
      content: `✅ **${panel.label}** posted in ${channel}.` + (panel.note ? ` ${panel.note}` : ''),
    });
  },
};
