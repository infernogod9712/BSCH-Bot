// BSCH Bot - fresh start
// Run with: node --env-file=.env index.js
//
// The bot token is read from an environment variable called DISCORD_TOKEN
// so it never gets saved inside the code (safe for a shared GitHub repo).
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const supportHandler = require('./handlers/supporthandler');

// ---- Create the bot ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---- Load every command from the commands/ folder ----
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`Skipping ${file} — missing "data" or "execute".`);
  }
}

// ---- Run a command when someone uses one ----
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash command → run the matching command file
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client, config);

    // Button click or modal submit → hand it to the support handler
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
      await supportHandler.handle(interaction, client, config);
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Something went wrong.', flags: 64 }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Something went wrong.', flags: 64 }).catch(() => {});
      }
    }
  }
});

// This runs once, when the bot successfully logs in
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// ---- Start the bot ----
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('No DISCORD_TOKEN found. Set it before running the bot.');
  process.exit(1);
}

client.login(token);
