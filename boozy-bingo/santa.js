// Party Games: Secret Santa. Draws who buys for whom (no self-draws, respecting exclusions) without the
// organiser seeing the pairings, then reveals each match privately: secret links (online, santa.html),
// pass-the-phone on this device, or printed fold-over slips.
window.startBoozySanta = () => {
  'use strict';

  const KEY = 'boozyBingo.santa';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = $('#tab-santa');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  // Default window for the availability calendar: 1–23 December, or the next three weeks once December has started.
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const defaultRange = () => {
    const now = new Date();
    if (now.getMonth() < 11) return [`${now.getFullYear()}-12-01`, `${now.getFullYear()}-12-23`];
    return [iso(now), iso(new Date(now.getTime() + 21 * 864e5))];
  };
  const S = Object.assign({
    event: `Secret Santa ${new Date().getFullYear()}`, budget: '€20', date: '', note: '',
    exclusions: '', noSwaps: true, draw: null, method: 'links',
    calFrom: defaultRange()[0], calTo: defaultRange()[1]
  }, load());
  const daysBetween = (from, to) => {
    const out = [];
    if (!from || !to || from > to) return out;
    for (let d = new Date(from + 'T12:00'); iso(d) <= to && out.length < 120; d.setDate(d.getDate() + 1)) out.push(iso(d));
    return out;
  };
  let cloud = null;
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500); };
  const token = (n = 20) => { const abc = 'abcdefghjkmnpqrstuvwxyz23456789'; return [...crypto.getRandomValues(new Uint8Array(n))].map(x => abc[x % abc.length]).join(''); };
  const nameKey = s => s.trim().toLowerCase();

  // ---------- Parsing & the draw ----------
  // One person per line, optionally with an email: "Anna", "Anna, anna@x.com" or "Anna <anna@x.com>".
  // Emails only ever stay in this browser; they're used to address the invite emails.
  const EMAIL = /^(.*?)[\s,;<]+([^\s<>,;@]+@[^\s<>,;@]+\.[^\s<>,;@]+)>?$/;
  const parseLine = line => {
    const l = line.trim().replace(/\s+/g, ' '), m = l.match(EMAIL);
    return m ? { name: m[1].trim(), email: m[2] } : { name: l, email: '' };
  };
  const validEmail = e => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(e);
  if (!Array.isArray(S.list)) {
    S.list = (S.people || '').split('\n').map(parseLine).filter(e => e.name);
    delete S.people;
  }
  while (S.list.length < 3) S.list.push({ name: '', email: '' });
  const entries = () => {
    const seen = new Set();
    return S.list.map(e => ({ name: (e.name || '').trim().replace(/\s+/g, ' '), email: validEmail((e.email || '').trim()) ? e.email.trim() : '' }))
      .filter(e => e.name && !seen.has(nameKey(e.name)) && seen.add(nameKey(e.name)));
  };
  const people = () => entries().map(e => e.name);
  // "Anna & Ben", "Anna, Ben", "Anna - Ben": these two never draw each other (either way round).
  function exclusions(names) {
    const known = new Map(names.map(n => [nameKey(n), n])), pairs = [], unknown = [];
    S.exclusions.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(/\s*(?:&|,|\+|\/|\band\b|\s-\s)\s*/i).map(s => s.trim()).filter(Boolean);
      const found = parts.map(p => known.get(nameKey(p)));
      parts.forEach((p, i) => { if (!found[i]) unknown.push(p); });
      const ok = found.filter(Boolean);
      for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) pairs.push([ok[i], ok[j]]);
    });
    return { pairs, unknown };
  }
  // Backtracking search over a shuffled order: everyone gives to exactly one other person.
  function drawPairs(names, pairs, noSwaps) {
    const banned = new Set(pairs.flatMap(([a, b]) => [`${a}→${b}`, `${b}→${a}`]));
    const order = names.slice().sort(() => Math.random() - 0.5);
    const taken = new Set(), result = {};
    let steps = 0;
    function place(i) {
      if (i === order.length) return true;
      if (++steps > 200000) return false;
      const giver = order[i];
      const options = names.filter(r => r !== giver && !taken.has(r) && !banned.has(`${giver}→${r}`)
        && !(noSwaps && names.length > 3 && result[r] === giver)).sort(() => Math.random() - 0.5);
      for (const r of options) {
        result[giver] = r; taken.add(r);
        if (place(i + 1)) return true;
        delete result[giver]; taken.delete(r);
      }
      return false;
    }
    return place(0) ? result : null;
  }

  // ---------- Setup ----------
  function render() {
    if (S.draw) return renderDraw();
    const names = people(), ex = exclusions(names);
    host.innerHTML = `<div class="grid2">
      <div class="card">
        <h2>🎁 Secret Santa</h2>
        <p class="hint">Add everyone taking part and press <b>Draw names</b>. Each person gets someone to buy for, never themselves, and you, the organiser, won't see who got whom.</p>
        <div class="fields">
          <div style="grid-column:1/-1"><label for="ssEvent">Event name</label><input type="text" id="ssEvent" value="${esc(S.event)}"></div>
          <div><label for="ssBudget">Budget</label><input type="text" id="ssBudget" value="${esc(S.budget)}" placeholder="€20"></div>
          <div><label for="ssDate">Gift exchange date</label><input type="date" id="ssDate" value="${esc(S.date)}"></div>
        </div>
        <label>Possible dates for the get-together</label>
        <div class="row"><input type="date" id="ssFrom" value="${esc(S.calFrom)}" style="width:auto" aria-label="From"><span class="hint">to</span><input type="date" id="ssTo" value="${esc(S.calTo)}" style="width:auto" aria-label="To"></div>
        <p class="hint">Everyone marks the days they're free on their private page, and you pick the best one. Leave the exchange date empty until then.</p>
        <label for="ssNote">Note for everyone (optional)</label>
        <input type="text" id="ssNote" maxlength="200" value="${esc(S.note)}" placeholder="e.g. Bring your gift wrapped to the office party">
        <label class="check"><input type="checkbox" id="ssSwaps" ${S.noSwaps ? 'checked' : ''}> Don't let two people simply buy for each other</label>
      </div>
      <div>
        <div class="card">
          <div class="row" style="justify-content:space-between"><h2 style="margin:0">Who's taking part?</h2><span class="pill" id="ssCount"></span></div>
          <p class="hint">Add an email to send that person an email invite. Emails stay on this device. Tip: paste a list of names, one per line, into a name box to add them all at once.</p>
          <div class="ssrows" id="ssRows"></div>
          <button class="btn mt" id="ssAdd">＋ Add person</button>
        </div>
        <div class="card">
          <h2>Exclusions (optional)</h2>
          <p class="hint">People who shouldn't draw each other, like couples or housemates. One pair per line, e.g. <i>Anna &amp; Ben</i>.</p>
          <textarea class="short" id="ssEx" style="min-height:90px" placeholder="Anna & Ben">${esc(S.exclusions)}</textarea>
          ${ex.unknown.length ? `<p class="pill warn mt">Not in the list: ${ex.unknown.map(esc).join(', ')}</p>` : ''}
        </div>
      </div>
    </div>
    <div class="row mt"><button class="btn primary" id="ssDraw" ${names.length >= 3 ? '' : 'disabled'}>🎲 Draw names</button>
      <span class="hint">${names.length >= 3 ? '' : 'You need at least 3 people.'}</span></div>`;
    const read = () => {
      S.event = $('#ssEvent').value.trim() || 'Secret Santa'; S.budget = $('#ssBudget').value.trim(); S.date = $('#ssDate').value;
      S.note = $('#ssNote').value.trim(); S.noSwaps = $('#ssSwaps').checked; S.exclusions = $('#ssEx').value;
      S.calFrom = $('#ssFrom').value; S.calTo = $('#ssTo').value;
      save();
    };
    host.querySelectorAll('input:not([data-f]), textarea').forEach(el => el.addEventListener('change', () => { read(); render(); }));
    $('#ssDraw').onclick = async () => { read(); await doDraw(); };
    $('#ssAdd').onclick = () => addRow();
    renderRows();
  }

  // ---------- Participant rows ----------
  function renderRows(focus) {
    const box = $('#ssRows');
    box.innerHTML = S.list.map((e, i) => `<div class="ssrow">
      <input type="text" data-f="name" data-i="${i}" maxlength="40" value="${esc(e.name)}" placeholder="Name" aria-label="Name ${i + 1}">
      <input type="email" data-f="email" data-i="${i}" maxlength="120" value="${esc(e.email)}" placeholder="Email (optional)" aria-label="Email ${i + 1}">
      <button class="lvkick" data-rm="${i}" aria-label="Remove person ${i + 1}" title="Remove">✕</button></div>`).join('');
    box.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('input', () => { S.list[inp.dataset.i][inp.dataset.f] = inp.value; save(); refreshRows(); });
      inp.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const i = Number(inp.dataset.i);
        if (inp.dataset.f === 'name') return box.querySelector(`[data-f="email"][data-i="${i}"]`).focus();
        addRow(i + 1);
      });
    });
    // Pasting several lines into a name box adds one person per line ("Anna, anna@x.com" works too).
    box.querySelectorAll('[data-f="name"]').forEach(inp => inp.addEventListener('paste', ev => {
      const text = (ev.clipboardData || window.clipboardData).getData('text');
      if (!/\n/.test(text.trim())) return;
      ev.preventDefault();
      const i = Number(inp.dataset.i), rows = text.split(/\r?\n/).map(parseLine).filter(e => e.name);
      S.list.splice(i, S.list[i].name || S.list[i].email ? 0 : 1, ...rows);
      save(); renderRows(); toast(`Added ${rows.length} people`);
    }));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      S.list.splice(Number(b.dataset.rm), 1);
      if (!S.list.length) S.list.push({ name: '', email: '' });
      save(); renderRows();
    });
    refreshRows();
    if (focus !== undefined) { const f = box.querySelector(`[data-f="name"][data-i="${focus}"]`); if (f) f.focus(); }
  }
  function addRow(at = S.list.length) {
    S.list.splice(at, 0, { name: '', email: '' });
    save(); renderRows(at);
  }
  // Count, warnings and the draw button update as you type, without redrawing the inputs.
  function refreshRows() {
    const names = people(), counts = {};
    S.list.forEach(e => { const k = nameKey(e.name || ''); if (k) counts[k] = (counts[k] || 0) + 1; });
    $('#ssRows').querySelectorAll('[data-f]').forEach(inp => {
      const e = S.list[inp.dataset.i], bad = inp.dataset.f === 'email'
        ? !!e.email.trim() && !validEmail(e.email.trim())
        : counts[nameKey(e.name || '')] > 1;
      inp.classList.toggle('bad', bad);
      inp.setAttribute('aria-invalid', String(bad));
      inp.title = bad ? (inp.dataset.f === 'email' ? 'This email doesn\'t look right' : 'This name appears twice') : '';
    });
    const pill = $('#ssCount');
    pill.textContent = `${names.length} people`;
    pill.className = 'pill ' + (names.length >= 3 ? 'ok' : 'warn');
    $('#ssDraw').disabled = names.length < 3;
    $('#ssDraw').nextElementSibling.textContent = names.length >= 3 ? '' : 'You need at least 3 people.';
  }

  async function doDraw() {
    const list = entries(), names = list.map(e => e.name), ex = exclusions(names);
    const result = drawPairs(names, ex.pairs, S.noSwaps);
    if (!result) { toast('😕 No valid draw with these exclusions. Try removing one.'); return; }
    // The pairings are only kept as private per-person entries; the organiser's screen never lists them.
    S.draw = { id: token(12), at: Date.now(), people: list.map(e => ({ name: e.name, email: e.email, token: token(), wish: token(), avail: token(), to: result[e.name], seen: false })), online: false, opened: {}, free: {} };
    save();
    if (cloud) await publish();
    render();
    toast('🎁 Names drawn! Nobody knows who got whom… yet.');
  }

  // ---------- Online: secret links ----------
  const linkFor = p => new URL(`santa.html?d=${S.draw.id}&t=${p.token}`, location.href).href;
  // A ready-to-send invite in the organiser's own email app. It only contains the link, never the match.
  function mailto(p) {
    const fmtDate = S.date ? new Date(S.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const body = [`Hi ${p.name},`, '', `You're invited to ${S.event}! 🎁`, '',
      'Names have been drawn, and your match is waiting behind your private link. It\'s just for you, so please don\'t share it:', linkFor(p), '',
      ...(S.budget ? [`Budget: ${S.budget}`] : []), ...(fmtDate ? [`Gift exchange: ${fmtDate}`] : []), ...(S.note ? [S.note] : []),
      '', 'On the same page you can add the things you\'d like for your Secret Santa, and mark the days you\'re free to get together.', '', 'Ho ho ho! 🎅'].join('\n');
    return `mailto:${encodeURIComponent(p.email || '')}?subject=${encodeURIComponent(`🎁 Your ${S.event} invite`)}&body=${encodeURIComponent(body)}`;
  }
  async function publish() {
    const d = S.draw, fs = cloud.fs, db = cloud.db;
    const wishOf = name => d.people.find(p => p.name === name).wish;
    d.people.forEach(p => { p.avail = p.avail || token(); });
    try {
      await fs.setDoc(fs.doc(db, 'santa', d.id), { hostUid: cloud.user.uid, event: S.event, createdAt: fs.serverTimestamp() });
      await Promise.all(d.people.flatMap(p => [
        fs.setDoc(fs.doc(db, 'santa', d.id, 'reveals', p.token), {
          name: p.name, to: p.to, event: S.event, budget: S.budget, date: S.date, note: S.note,
          myWish: p.wish, theirWish: wishOf(p.to), myAvail: p.avail, calFrom: S.calFrom || '', calTo: S.calTo || '', openedAt: null
        }),
        fs.setDoc(fs.doc(db, 'santa', d.id, 'wishes', p.wish), { name: p.name, wishlist: '', wants: [], updatedAt: null }),
        fs.setDoc(fs.doc(db, 'santa', d.id, 'avail', p.avail), { name: p.name, days: [], updatedAt: null })
      ]));
      d.online = true; d.calReady = true; save();
    } catch (e) { toast('⚠️ Couldn\'t create the private links: ' + e.message); }
  }
  // Push the date range / chosen date to everyone's page. Draws made before the calendar existed
  // get their calendar entries here, so links that were already sent keep working.
  async function pushDates() {
    const d = S.draw, fs = cloud.fs, db = cloud.db;
    const fresh = d.people.filter(p => !p.avail || !d.calReady);
    d.people.forEach(p => { p.avail = p.avail || token(); });
    await Promise.all(fresh.map(p => fs.setDoc(fs.doc(db, 'santa', d.id, 'avail', p.avail), { name: p.name, days: [], updatedAt: null }, { merge: true })));
    await Promise.all(d.people.map(p => fs.updateDoc(fs.doc(db, 'santa', d.id, 'reveals', p.token),
      { date: S.date || '', calFrom: S.calFrom || '', calTo: S.calTo || '', myAvail: p.avail })));
    d.calReady = true; save();
  }
  async function unpublish(d) {
    if (!cloud || !d || !d.online) return;
    const fs = cloud.fs, db = cloud.db;
    await Promise.all(d.people.flatMap(p => [
      fs.deleteDoc(fs.doc(db, 'santa', d.id, 'reveals', p.token)), fs.deleteDoc(fs.doc(db, 'santa', d.id, 'wishes', p.wish)),
      ...(p.avail ? [fs.deleteDoc(fs.doc(db, 'santa', d.id, 'avail', p.avail))] : [])
    ])).catch(() => {});
    await fs.deleteDoc(fs.doc(db, 'santa', d.id)).catch(() => {});
  }
  // Who has opened their link (never what it says) and which days everyone is free.
  async function refreshOpened() {
    if (!cloud || !S.draw || !S.draw.online) return;
    const fs = cloud.fs, db = cloud.db, d = S.draw;
    if (!d.calReady) { try { await pushDates(); } catch {} }
    d.free = d.free || {};
    await Promise.all(d.people.map(async p => {
      try { const snap = await fs.getDoc(fs.doc(db, 'santa', d.id, 'reveals', p.token)); d.opened[p.name] = !!(snap.exists() && snap.data().openedAt); } catch {}
      if (p.avail) {
        try { const a = await fs.getDoc(fs.doc(db, 'santa', d.id, 'avail', p.avail)); if (a.exists()) d.free[p.name] = { days: a.data().days || [], answered: !!a.data().updatedAt }; } catch {}
      }
    }));
    save(); if ($('#ssLinks') || $('#ssCal')) renderDraw();
  }

  // ---------- After the draw ----------
  function renderDraw() {
    const d = S.draw;
    const tabs = [['links', '📱 Private links'], ['pass', '🖐️ Pass the phone'], ['print', '🖨️ Print slips']];
    const fmtDate = S.date ? new Date(S.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' }) : '';
    host.innerHTML = `<div class="card">
        <div class="row" style="justify-content:space-between">
          <div><h2 style="margin:0">🎁 ${esc(S.event)}</h2>
            <p class="hint" style="margin:4px 0 0">${d.people.length} people${S.budget ? ` · budget ${esc(S.budget)}` : ''}${fmtDate ? ` · exchange ${esc(fmtDate)}` : ''} · drawn ${new Date(d.at).toLocaleDateString()}</p></div>
          <div class="row"><button class="btn" id="ssPeek" title="Shows every pairing">🙈 Reveal all</button><button class="btn danger" id="ssReset">Start over</button></div>
        </div>
        <p class="hint mt">🤫 The names are drawn. Choose how each person finds out who they're buying for:</p>
        <div class="seg">${tabs.map(([id, n]) => `<button class="${S.method === id ? 'active' : ''}" data-method="${id}">${n}</button>`).join('')}</div>
      </div>
      <div class="mt" id="ssBody"></div>
      <div class="mt" id="ssCalWrap"></div>`;
    renderCalendar();
    host.querySelectorAll('[data-method]').forEach(b => b.onclick = () => { S.method = b.dataset.method; save(); renderDraw(); });
    $('#ssReset').onclick = async () => {
      if (!confirm('Start over? The current draw and any private links will be deleted.')) return;
      const old = S.draw; S.draw = null; save(); await unpublish(old); render();
    };
    $('#ssPeek').onclick = () => {
      if (!confirm('Show every pairing? This spoils the surprise for you!')) return;
      $('#ssBody').innerHTML = `<div class="card"><h2>All pairings</h2><div class="lrlist ssall">${d.people.map(p => `<div><span>${esc(p.name)}</span><b>→ ${esc(p.to)}</b></div>`).join('')}</div>
        <button class="btn mt" id="ssHide">Hide</button></div>`;
      $('#ssHide').onclick = renderDraw;
    };
    const body = $('#ssBody');
    if (S.method === 'links') {
      if (!cloud) {
        body.innerHTML = `<div class="card"><h2>📱 Private links</h2><p class="hint">Private links need the online version of Party Games, signed in with Google. On this device you can use <b>Pass the phone</b> or <b>Print slips</b> instead.</p></div>`;
      } else if (!d.online) {
        body.innerHTML = `<div class="card"><h2>📱 Private links</h2><p class="hint">This draw was made offline. Create the links now?</p><button class="btn primary" id="ssPublish">Create private links</button></div>`;
        $('#ssPublish').onclick = async () => { await publish(); renderDraw(); };
      } else {
        const opened = d.people.filter(p => d.opened[p.name]).length;
        body.innerHTML = `<div class="card" id="ssLinks">
          <div class="row" style="justify-content:space-between"><h2 style="margin:0">📱 Private links</h2>
            <span class="row"><span class="pill ${opened === d.people.length ? 'ok' : 'warn'}">${opened} of ${d.people.length} opened</span><button class="btn" id="ssRefresh">↻ Refresh</button></span></div>
          <p class="hint">Send each person their own invite. <b>✉️ Email</b> opens your email app with the invite ready to send. Their link only shows who <i>they're</i> buying for. There they can add the things they'd like and mark the days they're free.</p>
          <div class="sslinks">${d.people.map((p, i) => `<div class="sslink">
            <b>${esc(p.name)}${p.email ? `<small class="hint"> · ${esc(p.email)}</small>` : ''}</b>${d.opened[p.name] ? '<span class="pill ok">opened ✓</span>' : '<span class="pill">not opened</span>'}
            <span class="row">
              <a class="btn${p.email ? ' primary' : ''}" href="${esc(mailto(p))}">✉️ Email</a>
              <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`🎁 Hi ${p.name}! Your ${S.event} match is ready. Open your private link (just for you!): ${linkFor(p)}`)}">WhatsApp</a>
              <button class="btn" data-copy="${i}">Copy link</button><button class="btn" data-qr="${i}">QR</button>
            </span></div>`).join('')}</div>
        </div>`;
        body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
          const p = d.people[b.dataset.copy];
          navigator.clipboard.writeText(linkFor(p)).then(() => toast(`Link for ${p.name} copied`), () => prompt(`Link for ${p.name}:`, linkFor(p)));
        });
        body.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => showQr(d.people[b.dataset.qr]));
        $('#ssRefresh').onclick = refreshOpened;
      }
    } else if (S.method === 'pass') {
      body.innerHTML = `<div class="card"><h2>🖐️ Pass the phone</h2><p class="hint">Hand this device round. Each person taps their own name, checks who they got, and hides it again before passing it on.</p>
        <div class="packs">${d.people.map((p, i) => `<button class="pack${p.seen ? ' active' : ''}" data-pass="${i}"><span class="pe">${p.seen ? '✅' : '🎁'}</span><b>${esc(p.name)}</b>${p.seen ? '<small>seen</small>' : ''}</button>`).join('')}</div></div>`;
      body.querySelectorAll('[data-pass]').forEach(b => b.onclick = () => passReveal(d.people[b.dataset.pass]));
    } else {
      body.innerHTML = `<div class="card"><h2>🖨️ Print slips</h2><p class="hint">Prints one slip per person. Cut along the dashed lines, then fold the striped flap up over the middle so only the person's name shows. Hand each slip to the person named on it.</p>
        <button class="btn primary" id="ssPrint">🖨️ Print slips</button></div>`;
      $('#ssPrint').onclick = printSlips;
    }
  }

  // ---------- Availability ----------
  let selDay = null;
  // Pick black or white text for a calendar cell, whichever contrasts more with its heat colour.
  function inkFor(heatPct) {
    const css = getComputedStyle(document.documentElement);
    const rgb = v => { const h = v.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const lum = c => { const l = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
    const a = rgb(css.getPropertyValue('--accent')), b = rgb(css.getPropertyValue('--bg'));
    if (a.some(isNaN) || b.some(isNaN)) return '';
    const L = lum(a.map((v, i) => Math.round(v * heatPct / 100 + b[i] * (1 - heatPct / 100))));
    return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#000' : '#fff';
  }
  function renderCalendar() {
    const wrap = $('#ssCalWrap'), d = S.draw;
    if (!wrap || !cloud || !d.online) { if (wrap) wrap.innerHTML = ''; return; }
    const days = daysBetween(S.calFrom, S.calTo), n = d.people.length, free = d.free || {};
    const freeOn = day => d.people.filter(p => free[p.name] && free[p.name].days.includes(day)).map(p => p.name);
    const counts = days.map(day => freeOn(day).length), max = Math.max(0, ...counts);
    const answered = d.people.filter(p => free[p.name] && free[p.name].answered).length;
    const label = (day, opts) => new Date(day + 'T12:00').toLocaleDateString(undefined, opts);
    if (selDay && !days.includes(selDay)) selDay = null;
    wrap.innerHTML = `<div class="card" id="ssCal">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">📅 When is everyone free?</h2>
        <span class="row"><span class="pill ${answered === n ? 'ok' : 'warn'}">${answered} of ${n} answered</span><button class="btn" id="ssCalRefresh">↻ Refresh</button></span></div>
      <p class="hint">Everyone ticks the days they're free on their private page. The darker the day, the more people can make it. Tap a day to see who's free and set it as the exchange date.</p>
      <div class="row"><input type="date" id="ssCalFrom" value="${esc(S.calFrom)}" style="width:auto" aria-label="Possible dates from"><span class="hint">to</span>
        <input type="date" id="ssCalTo" value="${esc(S.calTo)}" style="width:auto" aria-label="Possible dates to"><button class="btn" id="ssCalSave">Update dates</button></div>
      ${days.length ? `<div class="sscal">${days.map((day, i) => {
        const c = counts[i], pct = n ? Math.round(100 * c / n) : 0;
        const heat = c ? 12 + Math.round(70 * c / n) : 0;
        return `<button class="ssday${max && c === max ? ' best' : ''}${day === selDay ? ' sel' : ''}${day === S.date ? ' chosen' : ''}" data-day="${day}"
          style="--heat:${heat}%;color:${inkFor(heat)}" title="${esc(label(day, { weekday: 'long', day: 'numeric', month: 'long' }))}: ${c} of ${n} free">
          <small>${esc(label(day, { weekday: 'short' }))}</small><b>${esc(label(day, { day: 'numeric', month: 'short' }))}</b><span>${max && c === max ? '⭐ ' : ''}${c}/${n}</span></button>`;
      }).join('')}</div>` : '<p class="pill warn mt">Choose a valid date range.</p>'}
      ${selDay ? (() => { const who = freeOn(selDay), not = d.people.map(p => p.name).filter(x => !who.includes(x));
        return `<div class="ssdaydetail mt"><h3>${esc(label(selDay, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
          <p>✅ Free: ${who.length ? who.map(esc).join(', ') : '<span class="hint">nobody yet</span>'}</p>
          ${not.length ? `<p class="hint">Not free or not answered: ${not.map(esc).join(', ')}</p>` : ''}
          ${selDay === S.date ? '<p class="pill ok">📌 This is the exchange date</p>' : `<button class="btn primary" id="ssPick">📌 Make this the exchange date</button>`}</div>`; })() : ''}
    </div>`;
    $('#ssCalRefresh').onclick = refreshOpened;
    wrap.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { selDay = b.dataset.day === selDay ? null : b.dataset.day; renderCalendar(); });
    $('#ssCalSave').onclick = async () => {
      S.calFrom = $('#ssCalFrom').value; S.calTo = $('#ssCalTo').value; save();
      try { await pushDates(); toast('📅 Dates updated on everyone\'s page'); } catch (e) { toast('⚠️ ' + e.message); }
      renderDraw();
    };
    const pick = $('#ssPick');
    if (pick) pick.onclick = async () => {
      S.date = selDay; save();
      try { await pushDates(); toast(`📌 Exchange date set: ${label(selDay, { weekday: 'long', day: 'numeric', month: 'long' })}`); } catch (e) { toast('⚠️ ' + e.message); }
      renderDraw();
    };
  }

  function overlay(html) {
    const ov = document.createElement('div');
    ov.className = 'qroverlay ssov';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    return ov;
  }
  function showQr(p) {
    const qr = window.qrcode(0, 'M'); qr.addData(linkFor(p)); qr.make();
    const ov = overlay(`<div class="qrbig" style="width:min(60vh,80vw)">${qr.createSvgTag({ cellSize: 10, margin: 2, scalable: true })}</div>
      <h2>Only ${esc(p.name)} should scan this 🤫</h2><p class="hint">Click anywhere to close</p>`);
    ov.onclick = () => ov.remove();
  }
  function passReveal(p) {
    const ov = overlay(`<div class="ssbox">🎁</div><h2>Are you ${esc(p.name)}?</h2><p>Make sure nobody else is looking!</p>
      <div class="row" style="justify-content:center"><button class="btn primary" id="ssYes">Yes, show me</button><button class="btn" id="ssNo">Not me</button></div>`);
    ov.style.cursor = 'default';
    ov.querySelector('#ssNo').onclick = () => ov.remove();
    ov.querySelector('#ssYes').onclick = () => {
      ov.innerHTML = `<p class="hint">${esc(p.name)}, you're buying a gift for…</p><h2 class="ssname">${esc(p.to)}</h2>
        ${S.budget ? `<p>Budget: <b>${esc(S.budget)}</b></p>` : ''}${S.note ? `<p class="hint">${esc(S.note)}</p>` : ''}
        <button class="btn primary mt" id="ssGot">Got it, hide it</button>`;
      ov.querySelector('#ssGot').onclick = () => { p.seen = true; save(); ov.remove(); renderDraw(); };
    };
  }
  function printSlips() {
    const fmtDate = S.date ? new Date(S.date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    $('#printArea').innerHTML = `<div class="ssslips">${S.draw.people.map(p => `<div class="ssslip">
      <div class="ssfront">🎁 ${esc(S.event)}<b>For ${esc(p.name)} only</b></div>
      <div class="ssback">You're buying a gift for<b>${esc(p.to)}</b>${S.budget ? `<span>Budget: ${esc(S.budget)}</span>` : ''}${fmtDate ? `<span>Exchange: ${esc(fmtDate)}</span>` : ''}${S.note ? `<span>${esc(S.note)}</span>` : ''}<small>🤫 Keep it secret!</small></div>
      <div class="ssflap"><span>↑ Fold this flap up over the middle to hide the name ↑</span></div>
    </div>`).join('')}</div>`;
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 50));
  }

  window.boozySanta = {
    render,
    // Sign-in finishes after the first render, so redraw with the online features, then fetch the latest.
    connect(ctx) { cloud = ctx; render(); if (S.draw && S.draw.online) refreshOpened(); },
    _draw: drawPairs // exposed for testing the draw logic
  };
  render();
};
