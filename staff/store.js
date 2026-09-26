// staff/store.js
// Staff records: infractions, and suspensions the bot has to undo later.
// Kept in data/staff.json so a suspension survives a restart.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.BSCH_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'staff.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return { infractions: {}, suspensions: {} };
  }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function addInfraction(userId, entry) {
  const data = readData();
  data.infractions[userId] = data.infractions[userId] || [];
  data.infractions[userId].push({ ...entry, at: new Date().toISOString() });
  writeData(data);
  return data.infractions[userId];
}

function getInfractions(userId) {
  return readData().infractions[userId] || [];
}

// roleIds are the roles taken away, so they can be handed back on return.
function addSuspension(userId, { roleIds, until, reason, byId }) {
  const data = readData();
  data.suspensions[userId] = { userId, roleIds, until, reason, byId, startedAt: new Date().toISOString() };
  writeData(data);
  return data.suspensions[userId];
}

function getSuspension(userId) {
  return readData().suspensions[userId] || null;
}

function clearSuspension(userId) {
  const data = readData();
  delete data.suspensions[userId];
  writeData(data);
}

function getExpiredSuspensions(now = Date.now()) {
  return Object.values(readData().suspensions).filter(s => new Date(s.until).getTime() <= now);
}

module.exports = {
  readData, writeData,
  addInfraction, getInfractions,
  addSuspension, getSuspension, clearSuspension, getExpiredSuspensions,
};
