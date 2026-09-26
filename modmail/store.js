// modmail/store.js
// Data layer for the Mod Mail system.
//
// Mod Mail is a bot-based DM relay (SOP Section 7): a member DMs the bot to
// report a member, report a staff member (routed to Head Staff), or appeal a
// moderation action. Each conversation gets a thread on the staff side, and
// the two sides are relayed to each other by the bot.
//
// Sessions live in data/modmail.json so an open conversation SURVIVES A
// RESTART. Keyed by the member's Discord user ID (one open session per user).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'modmail.json');

function readData() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') raw = {};
  return { sessions: raw.sessions || {} };
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// The member's current OPEN session, if any.
function getOpenByUser(userId) {
  const data = readData();
  const s = data.sessions[userId];
  return s && s.status === 'open' ? s : null;
}

// Find whichever session owns a given staff-side thread (for staff replies).
function getByThread(threadId) {
  const data = readData();
  return Object.values(data.sessions).find(s => s.threadId === threadId) || null;
}

// Open a brand-new session for this user.
function open(userId, threadId, category) {
  const data = readData();
  data.sessions[userId] = {
    userId,
    threadId,
    category,               // 'member' | 'staff' | 'appeal'
    status: 'open',
    openedAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
  };
  writeData(data);
  return data.sessions[userId];
}

function close(userId, closedById) {
  const data = readData();
  if (!data.sessions[userId]) return null;
  data.sessions[userId].status = 'closed';
  data.sessions[userId].closedAt = new Date().toISOString();
  data.sessions[userId].closedBy = closedById;
  writeData(data);
  return data.sessions[userId];
}

module.exports = { readData, writeData, getOpenByUser, getByThread, open, close };
