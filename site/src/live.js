// live.js — BSCH's own "live from the server" panel.
//
// Reads Discord's public widget feed for the BSCH server and draws it in the
// site's blueprint style instead of Discord's stock iframe. Usernames come from
// strangers, so they only ever go into textContent, never into HTML.

(() => {
  const panel = document.getElementById('live');
  if (!panel) return;

  const FEED = `https://discord.com/api/guilds/${panel.dataset.guild}/widget.json`;
  const MAX_FACES = 18;
  const STATUS_LABEL = { online: 'online', idle: 'idle', dnd: 'busy' };

  const count = panel.querySelector('[data-live="count"]');
  const chips = panel.querySelector('[data-live="chips"]');
  const faces = panel.querySelector('[data-live="faces"]');
  const voice = panel.querySelector('[data-live="voice"]');
  const fallback = panel.querySelector('[data-live="fallback"]');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The widget feed doesn't say which members are bots, so stats.json lists them
  const BOTS = new Set((panel.dataset.bots || '').split('|').filter(Boolean));

  function render(data) {
    const everyone = Array.isArray(data.members) ? data.members : [];
    const members = everyone.filter(m => !BOTS.has(m.username));
    const bots = everyone.length - members.length;

    panel.classList.remove('is-down');
    count.textContent = members.length;

    // How many of each status, in a fixed order
    chips.replaceChildren();
    for (const status of ['online', 'idle', 'dnd']) {
      const n = members.filter(m => m.status === status).length;
      if (!n) continue;
      const chip = el('span', `chip s-${status}`);
      chip.append(el('i'), el('span', null, `${n} ${STATUS_LABEL[status]}`));
      chips.append(chip);
    }
    if (bots) {
      const chip = el('span', 'chip s-bots');
      chip.append(el('i'), el('span', null, `${bots} bot${bots === 1 ? '' : 's'} on duty`));
      chips.append(chip);
    }

    // Faces, ringed by status. Names show on hover and to screen readers.
    faces.replaceChildren();
    for (const member of members.slice(0, MAX_FACES)) {
      const face = el('span', `face s-${member.status}`);
      face.title = member.username;
      const url = String(member.avatar_url || '');
      if (url.startsWith('https://cdn.discordapp.com/')) {
        const img = el('img');
        img.src = url;
        img.alt = member.username;
        img.loading = 'lazy';
        img.width = 40;
        img.height = 40;
        face.append(img);
      } else {
        face.append(el('span', 'initial', (member.username || '?').trim().charAt(0).toUpperCase()));
      }
      faces.append(face);
    }
    if (members.length > MAX_FACES) {
      faces.append(el('span', 'face more', `+${members.length - MAX_FACES}`));
    }

    // Voice channels with someone in them
    voice.replaceChildren();
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const busy = channels
      .map(c => ({ name: c.name, n: members.filter(m => m.channel_id === c.id).length }))
      .filter(c => c.n > 0);
    voice.hidden = !busy.length;
    for (const c of busy) {
      voice.append(el('li', null, `🔊 ${c.name}: ${c.n} talking`));
    }
  }

  async function refresh() {
    try {
      const response = await fetch(FEED, { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status);
      render(await response.json());
    } catch {
      // Widget switched off, Discord down, or offline: keep the join button,
      // drop the live numbers rather than showing stale ones.
      panel.classList.add('is-down');
      fallback.hidden = false;
    }
  }

  refresh();
  setInterval(refresh, 2 * 60 * 1000);
})();
