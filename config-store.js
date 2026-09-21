// config-store.js
// Loads config.json, fills in any settings added since it was written, then
// applies the changes made with /config.
//
// /config never writes config.json: that file is tracked in git, and git-sync
// stops updating the bot if a tracked file changes on the Pi. Changes go to
// data/config-overrides.json (gitignored) and win over config.json.

const fs = require('fs');
const path = require('path');

const BASE_PATH = path.join(__dirname, 'config.json');
const OVERRIDES_PATH = path.join(process.env.BSCH_DATA_DIR || path.join(__dirname, 'data'), 'config-overrides.json');

// Settings that newer code expects. Added to the live config if missing.
const DEFAULTS = {
  channels: { drillRequestChannel: '' },
  timers: { drillBuildDeadlineDays: 5 },
};

// Everything /config can change. type: channel | category | role | roleList | number | text
const SETTINGS = {
  'channels.hireUs': { type: 'channel', label: 'Hire Us panel channel' },
  'channels.helpDesk': { type: 'channel', label: 'Help desk channel' },
  'channels.hireCaseLogsForum': { type: 'channel', label: 'Hire case logs forum' },
  'channels.templateLogForum': { type: 'channel', label: 'Template log forum' },
  'channels.applicationApprovalForum': { type: 'channel', label: 'Application approval forum' },
  'channels.drillRequestChannel': { type: 'channel', label: 'Drill requests channel' },
  'channels.drillResultsChannel': { type: 'channel', label: 'Drill results channel' },
  'channels.modLogsChannel': { type: 'channel', label: 'Mod logs channel' },
  'channels.modPaperworkForum': { type: 'channel', label: 'Mod paperwork forum' },
  'channels.staffAnnouncementsChannel': { type: 'channel', label: 'Staff announcements channel' },
  'channels.promotionsChannel': { type: 'channel', label: 'Promotions channel' },
  'channels.infractionsChannel': { type: 'channel', label: 'Infractions channel' },
  'channels.transcriptsChannel': { type: 'channel', label: 'Transcripts channel' },
  'channels.modmailChannel': { type: 'channel', label: 'Mod mail channel' },
  'categories.hireTickets': { type: 'category', label: 'Hire tickets category' },
  'categories.supportTickets': { type: 'category', label: 'Support tickets category' },
  'categories.applications': { type: 'category', label: 'Applications category' },
  'categories.drills': { type: 'category', label: 'Drills category' },
  'roles.owner': { type: 'role', label: 'Owner role' },
  'roles.coOwner': { type: 'role', label: 'Co-Owner role' },
  'roles.admin': { type: 'role', label: 'Admin role' },
  'roles.headStaff': { type: 'role', label: 'Head Staff role' },
  'roles.moderator': { type: 'role', label: 'Moderator role' },
  'roles.builder': { type: 'role', label: 'Builder role' },
  'roles.staffTeam': { type: 'role', label: 'Staff Team role' },
  'roles.trainee': { type: 'role', label: 'Trainee role' },
  'roles.member': { type: 'role', label: 'Member role' },
  'staffRoles': { type: 'roleList', label: 'Staff roles (pick a role to add or remove it)' },
  'timers.claimPingHours': { type: 'number', label: 'Hours before unclaimed cases ping Builders' },
  'timers.claimAutoCloseHours': { type: 'number', label: 'Hours before unclaimed cases close' },
  'timers.clientInactivityHours': { type: 'number', label: 'Hours before an inactive client is pinged' },
  'timers.applicationDenyCooldownDays': { type: 'number', label: 'Days before a denied applicant can reapply' },
  'timers.drillFailCooldownDays': { type: 'number', label: 'Days before a failed trainee can request a drill' },
  'timers.drillBuildDeadlineDays': { type: 'number', label: 'Days a builder trainee has to submit their drill build' },
  'links.donationLink': { type: 'text', label: 'Donation link' },
  'contract.currentText': { type: 'text', label: 'Hiring contract (text or link)' },
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}

function getPath(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  for (const k of parts.slice(0, -1)) {
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    o = o[k];
  }
  o[parts[parts.length - 1]] = value;
}

// Fill in missing keys from `defaults` without touching existing ones.
function backfill(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
      backfill(target[k], v);
    } else if (target[k] === undefined) {
      target[k] = v;
    }
  }
}

// Build the live config object. Every handler gets this same object, so
// set() changes apply everywhere without a restart.
function load() {
  const config = readJson(BASE_PATH, null);
  if (!config) {
    throw new Error('config.json is missing or is not valid JSON. Fix it before starting the bot.');
  }
  backfill(config, DEFAULTS);
  const overrides = readJson(OVERRIDES_PATH, {});
  for (const [key, value] of Object.entries(overrides)) {
    if (SETTINGS[key]) setPath(config, key, value);
  }
  return config;
}

function set(config, key, value) {
  setPath(config, key, value);
  const overrides = readJson(OVERRIDES_PATH, {});
  overrides[key] = value;
  fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2));
}

module.exports = { SETTINGS, load, set, getPath };
