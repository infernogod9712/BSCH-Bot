// BSCH Bot - fresh start
// Run with: node index.js
//
// The bot token is read from an environment variable called DISCORD_TOKEN
// so it never gets saved inside the code (safe for a shared GitHub repo).
// test 2
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
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
