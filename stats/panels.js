// stats/panels.js
// Remembers where each live panel was posted, so the bot can edit it later
// instead of spamming a new copy. One entry per panel key.

const fs = require('fs');
const path = require('path');
const stats = require('./store');

const DATA_DIR = process.env.BSCH_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'panels.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function get(key) {
  const entry = readData()[key];
  if (entry) return entry;

  // The referrals panel used to live in stats.json; pick it up from there once.
  if (key === 'referrals') {
    const old = stats.getPanel();
    if (old.channelId && old.messageId) {
      set(key, old.channelId, old.messageId);
      return { channelId: old.channelId, messageId: old.messageId };
    }
  }
  return { channelId: null, messageId: null };
}

function set(key, channelId, messageId) {
  const data = readData();
  data[key] = { channelId, messageId, postedAt: new Date().toISOString() };
  writeData(data);
  return data[key];
}

module.exports = { get, set };
