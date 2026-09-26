// hire/store.js
// The data layer for the hiring system.
//
// Every hire case is one record, keyed by a unique ticketId. All cases live
// in data/cases.json so they SURVIVE A RESTART (the SOP requires case data to
// outlive bot memory). This file is the ONLY place that reads/writes that file.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CASES_PATH = path.join(DATA_DIR, 'cases.json');

// Read the whole store. If the file doesn't exist yet, start fresh.
// The file used to be a plain map of cases with no counter. Read either shape
// so an old file can't take the timers down or hand out NaN ticket ids.
function readData() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'));
  } catch {
    return { counter: 0, cases: {} };
  }
  if (!raw || typeof raw !== 'object') return { counter: 0, cases: {} };

  const cases = raw.cases && typeof raw.cases === 'object' ? raw.cases : raw;
  // Old records kept the id only as the key
  for (const [id, record] of Object.entries(cases)) {
    if (record && typeof record === 'object' && record.ticketId === undefined) record.ticketId = id;
  }
  const highest = Object.keys(cases)
    .map(id => parseInt(id, 10))
    .filter(n => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);

  return {
    counter: Number.isFinite(raw.counter) ? Math.max(raw.counter, highest) : highest,
    drillCounter: Number.isFinite(raw.drillCounter) ? raw.drillCounter : 0,
    cases,
  };
}

// Write the whole store back to disk (creates data/ if missing).
function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CASES_PATH, JSON.stringify(data, null, 2));
}

// Create a new case. Bumps the counter to make a fresh ticketId, stamps in
// the default fields every case starts with, then merges whatever extra
// fields the caller passed (clientId, intake answers, etc).
// Builder drill cases (fields.drill) get their own D-numbered ids so they
// don't use up real case numbers.
function createCase(fields) {
  const data = readData();
  let ticketId;
  if (fields.drill) {
    data.drillCounter = (data.drillCounter || 0) + 1;
    ticketId = `D${data.drillCounter}`;
  } else {
    data.counter += 1;
    ticketId = data.counter;
  }

  const record = {
    ticketId,
    status: 'open',      // open -> claimed -> ... -> closed
    createdAt: new Date().toISOString(),
    clientId: null,
    channelId: null,     // filled in after the ticket channel is made
    forumThreadId: null, // filled in after the case-file post is made
    lead: null,          // the Builder who claimed it
    roster: [],          // all Builders on the case (lead + helpers)
    intake: {},          // the client's original answers
    extraInfo: [],       // numbered Extra Info entries
    ...fields,
  };

  data.cases[ticketId] = record;
  writeData(data);
  return record;
}

// Find a case by the ticket channel it lives in (how commands resolve "which
// case am I in?" from channel context — no typing IDs by hand).
function getCaseByChannel(channelId) {
  const data = readData();
  return Object.values(data.cases).find(c => c.channelId === channelId) || null;
}

// Merge a patch of changes into one case and save.
function updateCase(ticketId, patch) {
  const data = readData();
  if (!data.cases[ticketId]) return null;
  data.cases[ticketId] = { ...data.cases[ticketId], ...patch };
  writeData(data);
  return data.cases[ticketId];
}

// Drill cases are practice, so the client lookups below skip them.

// A client's finished builds (for the build-history lookup on intake).
function getClosedCasesByClient(clientId) {
  const data = readData();
  return Object.values(data.cases)
    .filter(c => !c.drill && c.clientId === clientId && c.status === 'closed');
}

// Any still-open case for this client (used to block duplicate hire tickets).
function getOpenCaseByClient(clientId) {
  const data = readData();
  return Object.values(data.cases)
    .find(c => !c.drill && c.clientId === clientId && c.status !== 'closed') || null;
}

// Every case a client has ever had (open or closed), newest first. Used by
// !buildlogs @client for a full history lookup.
function getAllCasesByClient(clientId) {
  const data = readData();
  return Object.values(data.cases)
    .filter(c => !c.drill && c.clientId === clientId)
    .sort((a, b) => b.ticketId - a.ticketId);
}

// Every case in the store (used by the timer sweep).
function getAllCases() {
  const data = readData();
  return Object.values(data.cases);
}

module.exports = {
  readData,
  writeData,
  createCase,
  getCaseByChannel,
  updateCase,
  getClosedCasesByClient,
  getOpenCaseByClient,
  getAllCasesByClient,
  getAllCases,
};
