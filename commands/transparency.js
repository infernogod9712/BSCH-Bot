const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { postNotes } = require('../handlers/transparency');

// Admins and above write a transparency post: a header plus additions, changes and
// removals, one per line. It goes to the transparency channel coloured like
// the server's existing posts. A form is used because slash command options
// can't hold more than one line.

const box = (id, label, placeholder, style = TextInputStyle.Paragraph, required = false) =>
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(style)
      .setRequired(required)
      .setMaxLength(style === TextInputStyle.Short ? 100 : 4000)
  );

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transparency')
    .setDescription('Post additions, changes and removals to the transparency channel (Admin+).'),

  async execute(interaction, client, config) {
    // Admin and above only: Head Staff can't post these
    const adminPlus = ['admin', 'coOwner', 'owner'].map(k => config.roles[k]).filter(Boolean);
    if (!adminPlus.some(id => interaction.member.roles.cache.has(id))) {
      return interaction.reply({ content: '❌ Only Admins and above can post transparency notes.', flags: 64 });
    }

    const channel = interaction.guild.channels.cache.get(config.channels.transparencyChannel);
    if (!channel) {
      return interaction.reply({ content: '❌ No transparency channel set. Set it with `/config`.', flags: 64 });
    }

    const modalId = `transparency:${interaction.id}`;
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Transparency post')
        .addComponents(
          box('header', 'Header', 'Server Update', TextInputStyle.Short, true),
          box('additions', 'Additions (one per line)', 'Added a link hub'),
          box('changes', 'Changes (one per line)', 'Higher levelling requirements reduced\n  Gold ➤ 25 (used to be 30)'),
          box('removals', 'Removals (one per line)', 'Deleted the Server Integrity Team role'),
        )
    );

    const submitted = await interaction.awaitModalSubmit({
      filter: i => i.customId === modalId && i.user.id === interaction.user.id,
      time: 15 * 60 * 1000,
    }).catch(() => null);
    if (!submitted) return;   // closed the form, or took longer than 15 minutes

    const notes = {
      header: submitted.fields.getTextInputValue('header').trim(),
      additions: submitted.fields.getTextInputValue('additions'),
      changes: submitted.fields.getTextInputValue('changes'),
      removals: submitted.fields.getTextInputValue('removals'),
    };

    if (![notes.additions, notes.changes, notes.removals].some(v => v && v.trim())) {
      return submitted.reply({ content: '❌ Add at least one addition, change or removal.', flags: 64 });
    }

    const sent = await postNotes(channel, notes).catch(() => 0);
    return submitted.reply({
      content: sent ? `✅ Posted in ${channel}.` : `❌ I couldn't post in ${channel}. Check my permissions there.`,
      flags: 64,
    });
  },
};
