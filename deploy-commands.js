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
