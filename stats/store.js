// stats/store.js
// "How did you find BSCH?" answers. One answer per person, kept in
// data/stats.json so the counts survive a restart.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.BSCH_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'stats.json');

// value -> what people see on the dropdown and the panel
const SOURCES = {
  ad: 'Advertisement',
  friend: 'A friend',
  partnership: 'Partnership post',
  disboard: 'Disboard',
  discadia: 'Discadia',
  other: 'Somewhere else',
};

function readData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return { answers: {}, panelMessageId: null, panelChannelId: null };
  }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function hasAnswered(userId) {
  return Boolean(readData().answers[userId]);
}

// context is 'hire', 'support' or 'application' — handy for later digging.
function recordAnswer(userId, source, context) {
  const data = readData();
  data.answers[userId] = { source, context, at: new Date().toISOString() };
  writeData(data);
  return data;
}

// { ad: 3, friend: 1, ... } plus the total, in SOURCES order.
function totals() {
  const counts = Object.fromEntries(Object.keys(SOURCES).map(k => [k, 0]));
  let total = 0;
  for (const answer of Object.values(readData().answers)) {
    if (counts[answer.source] === undefined) continue;
    counts[answer.source] += 1;
    total += 1;
  }
  return { counts, total };
}

function setPanel(channelId, messageId) {
  const data = readData();
  data.panelChannelId = channelId;
  data.panelMessageId = messageId;
  writeData(data);
}

function getPanel() {
  const data = readData();
  return { channelId: data.panelChannelId, messageId: data.panelMessageId };
}

module.exports = { SOURCES, readData, writeData, hasAnswered, recordAnswer, totals, setPanel, getPanel };
