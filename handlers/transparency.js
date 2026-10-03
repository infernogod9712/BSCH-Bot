// handlers/transparency.js
// Posts change notes to the transparency channel, coloured the way Discord
// colours an `ansi` code block: additions green, changes orange, removals red.
//
// Used two ways:
//   /transparency        a staff member writes one by hand
//   changelog.json       every bot update ships an entry; the bot posts any
//                        it hasn't posted yet each time it starts up

const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('../data-file');

const STATE_FILE = path.join(process.env.BSCH_DATA_DIR || path.join(__dirname, '..', 'data'), 'changelog-state.json');
const CHANGELOG = path.join(__dirname, '..', 'changelog.json');

const ESC = '\u001b';
const SECTIONS = [
  { key: 'additions', title: 'Additions', mark: '+', colour: `${ESC}[0;32m` },
  { key: 'changes', title: 'Changes', mark: '/', colour: `${ESC}[0;33m` },
  { key: 'removals', title: 'Removals', mark: '-', colour: `${ESC}[0;31m` },
];

// Discord caps a message at 2000 characters; leave room for the header
// and the code fences.
const ROOM = 1800;

// Accepts either one block of text (one line per item) or a list of items.
function toLines(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split('\n');
  return list.map(l => String(l).replace(/\s+$/, '')).filter(l => l.trim());
}

// Each line gets its section's mark. A line that starts with a space is a
// sub-line of the one above (like "Gold ➤ 25"), so it keeps no mark.
function markLine(line, mark) {
  if (/^\s/.test(line)) return `  ${line.trim()}`;
  const trimmed = line.trim();
  if (trimmed.startsWith(mark)) return trimmed;
  return `${mark} ${trimmed}`;
}

// Returns the message(s) to send. Long notes are split, and each part
// re-opens the colour it was in, so nothing goes back to grey mid-section.
function formatNotes({ header, additions, changes, removals }) {
  const values = { additions, changes, removals };
  const rows = [];   // [{ colour, text }]
  for (const section of SECTIONS) {
    const lines = toLines(values[section.key]);
    if (!lines.length) continue;
    // The gap line keeps the previous colour, so the new colour code sits on
    // the section title itself
    if (rows.length) rows.push({ colour: rows[rows.length - 1].colour, text: '' });
    rows.push({ colour: section.colour, text: section.title });
    for (const line of lines) rows.push({ colour: section.colour, text: markLine(line, section.mark) });
  }
  if (!rows.length) return [];

  const chunks = [];
  let current = null;
  for (const row of rows) {
    const piece = (current && current.colour === row.colour ? '' : row.colour) + row.text + '\n';
    if (!current || current.body.length + piece.length > ROOM) {
      current = { colour: row.colour, body: row.colour + row.text + '\n' };
      chunks.push(current);
    } else {
      current.body += piece;
      current.colour = row.colour;
    }
  }

  return chunks.map((chunk, i) => {
    const title = i === 0 && header ? `### ${header}\n` : '';
    return `${title}\`\`\`ansi\n${chunk.body.replace(/\n+$/, '')}\n\`\`\``;
  });
}

async function postNotes(channel, notes) {
  const messages = formatNotes(notes);
  for (const content of messages) {
    await channel.send({ content, allowedMentions: { parse: [] } });
  }
  return messages.length;
}

// ── Automatic "Bot Update" posts ──────────────────────────────────────────────
function readChangelog() {
  try {
    const list = JSON.parse(fs.readFileSync(CHANGELOG, 'utf-8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Posts every changelog entry the bot hasn't posted yet, oldest first. On the
// very first run it posts only the newest one, so the channel doesn't get the
// whole history at once.
async function postNewChangelog(client, config) {
  const entries = readChangelog();
  if (!entries.length) return 0;

  const channelId = config.channels && config.channels.transparencyChannel;
  if (!channelId) return 0;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return 0;

  const state = readJson(STATE_FILE, () => ({ posted: null }));
  const ids = entries.map(e => e.id);
  const start = state.posted && ids.includes(state.posted)
    ? ids.indexOf(state.posted) + 1
    : entries.length - 1;

  let posted = 0;
  for (const entry of entries.slice(start)) {
    const sent = await postNotes(channel, { header: entry.header || 'Bot Update', ...entry })
      .then(() => true).catch(err => { console.error('[transparency] could not post:', err.message); return false; });
    if (!sent) break;                       // try again next start-up
    writeJson(STATE_FILE, { posted: entry.id });
    posted += 1;
  }
  return posted;
}

module.exports = { formatNotes, postNotes, postNewChangelog, readChangelog };
