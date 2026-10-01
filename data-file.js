// data-file.js
// Reading and writing the bot's JSON data files without ever losing them.
//
// The bot rewrites a whole file every time something changes. That used to be
// dangerous: if a file couldn't be parsed (say, a comma left behind after
// hand-editing it on the Pi), it was quietly treated as empty, and the next
// save wrote that empty data over every record in it. Now:
//
//   - a file that doesn't exist yet       -> empty, nothing saved so far
//   - a file that exists but won't parse  -> refuse to read OR save it, and
//                                            say so loudly, until it's fixed
//   - every save goes to a temp file first and is then swapped in, so a crash
//     or power cut halfway through a save can't leave a half-written file

const fs = require('fs');
const path = require('path');

function readJson(file, empty) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return empty();
    throw err;
  }

  // A file with nothing in it holds nothing to lose
  if (!text.trim()) return empty();

  try {
    return JSON.parse(text);
  } catch (err) {
    const name = path.basename(file);
    const message =
      `${name} is not valid JSON (${err.message}). I won't read or save it, so nothing in it gets overwritten. ` +
      `Find the mistake with: python3 -m json.tool data/${name}   then fix it and restart me.`;
    console.error('[data] ' + message);
    throw new Error(message);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.saving`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}

module.exports = { readJson, writeJson };
