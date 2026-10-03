// site/build.js
// Turns sop.md into the staff SOP page and copies the rest of the site into
// site/dist, which is what Cloudflare Pages serves.
//
//   node site/build.js
//
// The SOP lives at an unguessable filename so it isn't linked or indexed
// anywhere. Change SOP_PATH to rotate the link.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const SOP_PATH = 'shakbboenbraprtacg.html';

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Strip markdown so a heading reads as plain text in the nav
function plain(text) {
  return text.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]*)\*\*/g, '$1').replace(/[*_]/g, '').trim();
}

function buildSop() {
  const md = fs.readFileSync(path.join(ROOT, 'sop.md'), 'utf-8');

  // Collect h2/h3 in order for the section rail
  const headings = [];
  const used = new Set();
  for (const line of md.split('\n')) {
    const m = /^(##|###)\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = plain(m[2]);
    let id = slug(text);
    let n = 2;
    while (used.has(id)) id = `${slug(text)}-${n++}`;
    used.add(id);
    headings.push({ level: m[1].length, text, id });
  }

  let html = marked.parse(md);

  // marked doesn't add ids, so give each heading the id the rail points at
  let i = 0;
  html = html.replace(/<h([23])>(.*?)<\/h\1>/gs, (match, level, inner) => {
    const heading = headings[i++];
    const id = heading ? heading.id : slug(inner.replace(/<[^>]+>/g, ''));
    return `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" title="Copy a link to this section">#</a></h${level}>`;
  });

  // Wide tables scroll on their own instead of stretching the page
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');

  const toc = headings
    .map(h => `<a class="${h.level === 3 ? 'sub' : ''}" href="#${h.id}">${h.text}</a>`)
    .join('\n');

  const updated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return fs.readFileSync(path.join(SRC, 'sop.template.html'), 'utf-8')
    .replace('__TOC__', toc)
    .replace('__BODY__', html)
    .replace('__UPDATED__', updated);
}

// Numbers, reviews and the invite link live in stats.json so they can be
// changed without touching markup. Real reviews come from the bot's rating
// step; until there are some, the page shows empty slots rather than invented
// quotes.
function fillTokens(html) {
  const stats = JSON.parse(fs.readFileSync(path.join(SRC, 'stats.json'), 'utf-8'));

  // reviews.json is written by the bot (through GitHub) when a client says
  // their review can go on the site, so its text is escaped like any user input
  const list = JSON.parse(fs.readFileSync(path.join(SRC, 'reviews.json'), 'utf-8'));
  const card = r => `<figure>
          <p class="score">${esc(r.score)}/10</p>
          <blockquote>${esc(r.quote)}</blockquote>
          <figcaption>${esc(r.who)}</figcaption>
        </figure>`;

  // The strip scrolls forever by sliding one copy of the cards and swapping in
  // an identical second copy. Short lists repeat so a copy is wider than a
  // screen and the loop never shows a gap.
  let reviews;
  if (list.length) {
    const copy = [];
    while (copy.length < Math.max(6, list.length)) copy.push(...list);
    const cards = copy.map(card).join('\n        ');
    reviews = `<div class="track" style="--dur:${copy.length * 10}s">
        <div class="set">${cards}</div>
        <div class="set" aria-hidden="true">${cards}</div>
      </div>`;
  } else {
    reviews = `<div class="track still"><div class="set">${[1, 2, 3].map(() => `<figure class="empty">
          <p class="score">-/10</p>
          <blockquote>Your rating here.</blockquote>
          <figcaption>Waiting on the next build</figcaption>
        </figure>`).join('\n        ')}</div></div>`;
  }

  // Stamp the css and js links with a hash of their contents, so a browser
  // never keeps yesterday's stylesheet after a deploy.
  const stamp = file => crypto.createHash('md5')
    .update(fs.readFileSync(path.join(SRC, file)))
    .digest('hex')
    .slice(0, 8);

  return html
    .replace('href="/base.css"', `href="/base.css?v=${stamp('base.css')}"`)
    .replace('src="/flow-chart.js"', `src="/flow-chart.js?v=${stamp('flow-chart.js')}"`)
    .replace('src="/motion.js"', `src="/motion.js?v=${stamp('motion.js')}"`)
    .replace('src="/live.js"', `src="/live.js?v=${stamp('live.js')}"`)
    .replace(/__DISCORD_APPLY__/g, stats.discordApply || stats.discord)
    .replace(/__DISCORD__/g, stats.discord)
    .replace(/__SERVERS__/g, stats.serversBuilt)
    .replace(/__CLAIM__/g, stats.claimHours)
    .replace(/__RATING__/g, stats.rating)
    .replace(/__BOTS__/g, esc((stats.widgetBots || []).join('|')))
    .replace(/__REVIEWS__/g, () => reviews);
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Every page gets the same tokens filled in, so the header and links match
  for (const file of fs.readdirSync(SRC)) {
    if (file === 'sop.template.html' || file === 'stats.json' || file === 'reviews.json') continue;
    const from = path.join(SRC, file);
    if (file.endsWith('.html')) {
      fs.writeFileSync(path.join(DIST, file), fillTokens(fs.readFileSync(from, 'utf-8')));
    } else {
      fs.copyFileSync(from, path.join(DIST, file));
    }
  }

  fs.writeFileSync(path.join(DIST, SOP_PATH), fillTokens(buildSop()));

  // Keep the SOP out of search engines and out of referrer headers
  fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /' + SOP_PATH + '\n');
  fs.writeFileSync(path.join(DIST, '_headers'),
    `/${SOP_PATH}\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n`);

  console.log(`Built site/dist — SOP at /${SOP_PATH}`);
}

build();
