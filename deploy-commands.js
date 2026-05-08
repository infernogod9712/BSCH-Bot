// deploy-commands.js
// Run this file ONCE with: node deploy-commands.js
// It registers the /panel slash command with Discord so it shows up in your server.
// You only need to re-run this if you add or change slash commands.

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config.json');

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Opens the admin control panel with action buttons')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('setthreshold')
    .setDescription('Set how many stars a message needs to be featured')
    .addIntegerOption(opt =>
      opt.setName('value').setDescription('Number of stars required').setRequired(true).setMinValue(1))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('countbotstar')
    .setDescription('Set whether the bot\'s own star counts toward the threshold')
    .addBooleanOption(opt =>
      opt.setName('enabled').setDescription('true = count it, false = ignore it').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('countselfstar')
    .setDescription('Set whether a user starring their own message counts')
    .addBooleanOption(opt =>
      opt.setName('enabled').setDescription('true = count it, false = ignore it').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot is online and see its latency')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Manually send the application reminder message to the applications channel')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('appstatus')
    .setDescription('Check whether applications are currently open or closed')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('result')
    .setDescription('Send an application result to a user and the applications channel')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The applicant').setRequired(true))
    .addStringOption(opt =>
      opt.setName('outcome').setDescription('Pass or Fail').setRequired(true)
        .addChoices({ name: 'Pass', value: 'pass' }, { name: 'Fail', value: 'fail' }))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the decision').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Posts a random meme')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get server info and stats')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Get the server member count')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Get a list of server roles')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Get a user's avatar")
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to get avatar for (defaults to you)').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Get bot info')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Post the ticket open panel in this channel')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway')
    .addStringOption(opt => opt.setName('prize').setDescription('What are you giving away?').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 30m, 2h, 1d').setRequired(true))
    .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners (default 1)').setRequired(false).setMinValue(1).setMaxValue(10))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption(opt => opt.setName('question').setDescription('The poll question').setRequired(true))
    .addStringOption(opt => opt.setName('option1').setDescription('Option 1').setRequired(false))
    .addStringOption(opt => opt.setName('option2').setDescription('Option 2').setRequired(false))
    .addStringOption(opt => opt.setName('option3').setDescription('Option 3').setRequired(false))
    .addStringOption(opt => opt.setName('option4').setDescription('Option 4').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('adduser')
    .setDescription('Add a user to this ticket')
    .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('removeuser')
    .setDescription('Remove a user from this ticket')
    .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a message to a channel')
    .addStringOption(opt =>
      opt.setName('message').setDescription('The message to send').setRequired(true))
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel to send to (defaults to this channel)').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('attachment').setDescription('Optional file or image to attach').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a user to a staff role')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to promote').setRequired(true))
    .addStringOption(opt =>
      opt.setName('role').setDescription('Role to promote them to').setRequired(true)
        .addChoices(
          { name: 'Moderator',  value: '1498134471352778793' },
          { name: 'Senior Mod', value: '1498946366326575176' },
          { name: 'Head Mod',   value: '1498946523768033310' },
          { name: 'Admin',      value: '1498134004489130105' },
          { name: 'Co Owner',   value: '1498419215483277462' },
        ))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the promotion').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a user from a staff role')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to demote').setRequired(true))
    .addStringOption(opt =>
      opt.setName('role').setDescription('Role to demote them to').setRequired(true)
        .addChoices(
          { name: 'Moderator',  value: '1498134471352778793' },
          { name: 'Senior Mod', value: '1498946366326575176' },
          { name: 'Head Mod',   value: '1498946523768033310' },
          { name: 'Admin',      value: '1498134004489130105' },
          { name: 'Co Owner',   value: '1498419215483277462' },
        ))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the demotion').setRequired(true))
    .toJSON(),
];

// Create a REST client using your bot token
const rest = new REST({ version: '10' }).setToken(config.token);

// Register the commands with Discord's API for your specific guild (server)
(async () => {
  try {
    console.log('Registering slash commands with Discord...');

    await rest.put(
      // This registers commands for a specific guild (instant update, great for testing)
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );

    console.log('Slash commands registered successfully!');
    console.log('You can now use /panel in your Discord server.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
})();
