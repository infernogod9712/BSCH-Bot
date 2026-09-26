// handlers/extrainfohandler.js
// Extra Info is kept with two chat commands typed straight into the ticket:
//
//   !inject <text>        add a new numbered requirement
//   !sub <number> <text>  replace that requirement with new wording
//   !sub <number>         remove that requirement
//
// Numbers never change. A removed entry stays in place, struck through, so
// "number 3" in the ticket conversation always means the same thing.

const store = require('../hire/store');

// Entries used to be plain strings. Read them as objects either way.
function normalize(entry) {
  if (typeof entry === 'string') return { text: entry, removed: false };
  return { text: entry.text, removed: Boolean(entry.removed), editedAt: entry.editedAt, removedAt: entry.removedAt };
}

function entriesOf(record) {
  return (record.extraInfo || []).map(normalize);
}

// How one entry reads in the case embed.
function renderEntry(entry) {
  const e = normalize(entry);
  return e.removed ? `~~${e.text}~~ (removed)` : e.text;
}

async function handleMessage(message, client, config) {
  const raw = message.content.trim();
  const lower = raw.toLowerCase();
  if (!lower.startsWith('!inject') && !lower.startsWith('!sub')) return false;

  const { updateCaseViews, isCaseBuilder } = require('./hiringhandler');

  const record = store.getCaseByChannel(message.channel.id);
  if (!record) {
    await message.reply('❌ Run this inside a hire case ticket.').catch(() => {});
    return true;
  }
  if (!isCaseBuilder(message.member, record, config)) {
    await message.reply('❌ Only Builders on the case can change Extra Info.').catch(() => {});
    return true;
  }

  const entries = entriesOf(record);

  // ---- !inject <text> ----
  if (lower.startsWith('!inject')) {
    const text = raw.slice('!inject'.length).trim();
    if (!text) {
      await message.reply('❌ Say what to record: `!inject client wants a red colour scheme`').catch(() => {});
      return true;
    }
    entries.push({ text, removed: false, addedAt: new Date().toISOString() });
    const updated = store.updateCase(record.ticketId, { extraInfo: entries });
    await updateCaseViews(message.guild, updated);
    await message.reply(`✅ Recorded as **Extra Info #${entries.length}**.`).catch(() => {});
    return true;
  }

  // ---- !sub <number> [text] ----
  const rest = raw.slice('!sub'.length).trim();
  const match = rest.match(/^#?(\d+)\s*([\s\S]*)$/);
  if (!match) {
    await message.reply('❌ Say which number: `!sub 3 the new wording` to replace it, or `!sub 3` to remove it.').catch(() => {});
    return true;
  }

  const number = parseInt(match[1], 10);
  const text = match[2].trim();
  const entry = entries[number - 1];

  if (!entry) {
    await message.reply(`❌ There's no Extra Info #${number} on this case (there ${entries.length === 1 ? 'is' : 'are'} ${entries.length}).`).catch(() => {});
    return true;
  }

  if (text) {
    entries[number - 1] = { ...entry, text, removed: false, editedAt: new Date().toISOString() };
    const updated = store.updateCase(record.ticketId, { extraInfo: entries });
    await updateCaseViews(message.guild, updated);
    await message.reply(`✅ **Extra Info #${number}** now reads: ${text}`).catch(() => {});
    return true;
  }

  if (entry.removed) {
    await message.reply(`❌ **Extra Info #${number}** was already removed.`).catch(() => {});
    return true;
  }

  entries[number - 1] = { ...entry, removed: true, removedAt: new Date().toISOString() };
  const updated = store.updateCase(record.ticketId, { extraInfo: entries });
  await updateCaseViews(message.guild, updated);
  await message.reply(`🗑️ **Extra Info #${number}** removed. It stays struck through on the case so the numbers keep matching.`).catch(() => {});
  return true;
}

module.exports = { handleMessage, renderEntry, entriesOf };
