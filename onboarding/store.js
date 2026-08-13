// onboarding/store.js
// Data layer for Onboarding (SOP Section 4): applications, drills, and the
// cooldowns that gate re-applying / re-drilling. All persisted in
// data/onboarding.json so an in-progress application or drill SURVIVES A
// RESTART.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'onboarding.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return { applications: {}, drills: {}, cooldowns: {} };
  }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// ---- Applications (keyed by applicant userId) ----
function getApplicationByUser(userId) {
  const data = readData();
  const a = data.applications[userId];
  return a && a.status === 'in-progress' ? a : null;
}

function getApplicationByChannel(channelId) {
  const data = readData();
  return Object.values(data.applications).find(a => a.channelId === channelId) || null;
}

function createApplication(userId, channelId, department, questions) {
  const data = readData();
  data.applications[userId] = {
    userId,
    channelId,
    department,          // 'builder' | 'mod' | 'both'
    questions,           // ordered list of question strings
    answers: [],         // ordered list of answer strings
    step: 0,
    status: 'in-progress', // in-progress -> submitted -> approved/denied
    createdAt: new Date().toISOString(),
  };
  writeData(data);
  return data.applications[userId];
}

function updateApplication(userId, patch) {
  const data = readData();
  if (!data.applications[userId]) return null;
  data.applications[userId] = { ...data.applications[userId], ...patch };
  writeData(data);
  return data.applications[userId];
}

// ---- Drills (keyed by trainee userId) ----
function getDrillByUser(userId) {
  const data = readData();
  const d = data.drills[userId];
  return d && d.status === 'in-progress' ? d : null;
}

function getDrillByChannel(channelId) {
  const data = readData();
  return Object.values(data.drills).find(d => d.channelId === channelId) || null;
}

function createDrill(traineeId, fields) {
  const data = readData();
  data.drills[traineeId] = {
    traineeId,
    status: 'in-progress', // in-progress -> passed/failed
    createdAt: new Date().toISOString(),
    ...fields,
  };
  writeData(data);
  return data.drills[traineeId];
}

function updateDrill(traineeId, patch) {
  const data = readData();
  if (!data.drills[traineeId]) return null;
  data.drills[traineeId] = { ...data.drills[traineeId], ...patch };
  writeData(data);
  return data.drills[traineeId];
}

// ---- Cooldowns (keyed by userId; ISO timestamps) ----
// kind is 'apply' or 'drill'.
function getCooldown(userId, kind) {
  const data = readData();
  const cd = data.cooldowns[userId];
  if (!cd || !cd[kind]) return null;
  const until = new Date(cd[kind]).getTime();
  return until > Date.now() ? until : null; // null if expired
}

function setCooldown(userId, kind, untilMs) {
  const data = readData();
  data.cooldowns[userId] = data.cooldowns[userId] || {};
  data.cooldowns[userId][kind] = new Date(untilMs).toISOString();
  writeData(data);
}

module.exports = {
  readData,
  writeData,
  getApplicationByUser,
  getApplicationByChannel,
  createApplication,
  updateApplication,
  getDrillByUser,
  getDrillByChannel,
  createDrill,
  updateDrill,
  getCooldown,
  setCooldown,
};
