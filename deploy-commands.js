const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`Skipping ${file} — no "data" export.`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} commands...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId),
      { body: commands },
    );
    console.log('✅ Commands deployed to the server!');
  } catch (error) {
    console.error(error);
  }
})();
