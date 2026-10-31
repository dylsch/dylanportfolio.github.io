// Boozy Bingo: "Who's most likely to…". The TV shows a prompt; players vote on their phones
// (through live.js) or, without phones, everyone points at someone on the count of three.
window.startBoozyMlt = () => {
  'use strict';

  const KEY = 'boozyBingo.mlt';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const host = $('#tab-mlt');

  const PACKS = {
    classic: { name: 'Classic', emoji: '😄', list: [
      'become famous', 'survive a zombie apocalypse', 'forget their own birthday', 'cry at a film', 'get lost even with GPS on',
      'become a millionaire', 'end up with ten cats', 'win a reality TV show', 'laugh at completely the wrong moment',
      'be late to their own wedding', 'talk their way out of a parking ticket', 'become prime minister', 'still be on their phone at 3am',
      'eat the last slice without asking', 'send a message to the wrong person', 'trip over absolutely nothing', 'start their own business',
      'move to another country on a whim', 'know every word of every song', 'binge a whole series in one weekend', 'go viral online',
      'lose their keys this week', 'make friends with a stranger on the bus', 'give the best advice', 'keep a secret forever',
      'spoil the ending of a film', 'win an argument with a lamp post', 'go skydiving', 'burn water while cooking', 'adopt every stray animal they meet'
    ] },
    party: { name: 'Party night', emoji: '🪩', list: [
      'start dancing on a table', 'be the last one still standing tonight', 'take the most selfies tonight', 'organise a group photo',
      'grab the karaoke mic without being asked', 'text their ex tonight', 'leave without saying goodbye', 'lose a shoe tonight',
      'make friends with the bouncer', 'spill something on themselves', 'start a conga line', 'take over the music without asking',
      'spend the whole party in the kitchen', 'eat a kebab at 4am', 'fall asleep first', 'say "just one more song" five times',
      'give a speech nobody asked for', 'dance like nobody is watching (everyone is)', 'post an embarrassing story tonight',
      'know everyone\'s name by the end of the night', 'end up chatting to the DJ all night', 'be first on the dance floor', 'start a sing-along',
      'forget where they parked', 'organise the next party'
    ] },
    work: { name: 'Work & study', emoji: '💼', list: [
      'reply-all by accident', 'talk for five minutes on mute', 'fall asleep in a meeting', 'become the boss',
      'submit an assignment at 11:59pm', 'bring cake to the office', 'have 100 browser tabs open', 'write "per my last email"',
      'book a meeting that could have been an email', 'forget their camera is on', 'pull an all-nighter before a deadline',
      'become best friends with IT', 'laminate something unnecessary', 'have the messiest desk', 'become a lecturer'
    ] },
    holidays: { name: 'Holidays', emoji: '🎄', list: [
      'eat all the Christmas chocolate before December', 'wear the ugliest Christmas jumper', 'open their presents early',
      'scare everyone on Halloween', 'wear a costume nobody understands', 'buy all their presents on Christmas Eve',
      'fall asleep after Christmas lunch', 'get sunburnt on the first day of summer', 'build the best sandcastle',
      'eat a whole figolla in one go', 'forget the sunscreen', 'win Secret Santa', 'go to every village festa in summer',
      'keep the Christmas tree up until February', 'cry at a Christmas advert'
    ] }
  };

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch {} };
  const M = Object.assign({ packs: ['classic', 'party'], custom: '', count: 15, timer: 20, sound: true, deck: null, tally: {} }, load());

  // Sound effects, synthesised with the Web Audio API (no audio files). Browsers only allow audio after
  // a click, so the context is created/resumed on the first click inside the game.
  const SFX = (() => {
    let ctx = null;
    const ac = () => {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!ctx) ctx = new C();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, to } = {}) {
      const c = M.sound && ac();
      if (!c) return;
      const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
    return {
      unlock: ac,
      beep: step => tone([523, 659, 784][step] || 784, 0.18, { type: 'square', vol: 0.12 }),   // 3… 2… 1… rising
      fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.22, at: i * 0.08 })); tone(131, 0.7, { type: 'sawtooth', vol: 0.08 }); },
      tick: () => tone(1200, 0.05, { type: 'square', vol: 0.08 }),                              // last seconds of voting
      buzzer: () => tone(150, 0.5, { type: 'sawtooth', vol: 0.12 }),                            // time's up
      reveal: () => { tone(250, 0.45, { vol: 0.18, to: 1000 }); tone(1319, 0.5, { type: 'triangle', vol: 0.18, at: 0.42 }); }
    };
  })();
  let timerId = null, autoTimer = null;

  // Live game bridge (live.js); phone voting needs at least two players.
  const live = () => (window.boozyLive && window.boozyLive.active() ? window.boozyLive : null);
  const phones = () => { const l = live(); return l && l.players().length >= 2 ? l : null; };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500); };

  function prompts() {
    const own = M.custom.split('\n').map(s => s.trim().replace(/^who'?s most likely to\s*/i, '').replace(/\?$/, '')).filter(Boolean);
    return [...own, ...M.packs.flatMap(p => (PACKS[p] ? PACKS[p].list : []))];
  }
  function newDeck() {
    const all = prompts();
    const own = M.custom.split('\n').filter(s => s.trim()).length;
    M.deck = { id: Date.now().toString(36), i: 0, revealed: false, results: null, choices: null,
      list: shuffle([...all.slice(0, own), ...shuffle(all.slice(own)).slice(0, Math.max(0, M.count - own))]) };
    M.tally = {};
    save();
  }
  const key = () => `mlt_${M.deck.id}_${M.deck.i}`;

  // ---------- Setup ----------
  function renderSetup() {
    stop();
    const d = M.deck, n = prompts().length;
    host.innerHTML = `<div class="grid2">
      <div class="card">
        <h2>🙋 Who's most likely to…</h2>
        <p class="hint">A prompt appears on the TV. With phones, everyone votes for a player and the most-voted person wins the round. Without phones, count down together and everyone points at someone.</p>
        <label>Prompt packs</label>
        <div class="row">${Object.entries(PACKS).map(([id, p]) => `<label class="chip"><input type="checkbox" data-mpack="${id}" ${M.packs.includes(id) ? 'checked' : ''}> ${p.emoji} ${p.name} <small>(${p.list.length})</small></label>`).join('')}</div>
        <div class="fields">
          <div><label for="mlCount">Rounds</label><input type="number" id="mlCount" min="1" max="200" value="${M.count}"></div>
          <div><label for="mlTimer">Voting time (seconds)</label><input type="number" id="mlTimer" min="5" max="120" value="${M.timer}"></div>
        </div>
        <label class="check"><input type="checkbox" id="mlSound" ${M.sound ? 'checked' : ''}> 🔊 Sound effects during the countdown</label>
        <div class="row mt">
          <button class="btn primary" id="mlNew" ${n ? '' : 'disabled'}>${d ? 'New game' : 'Start game'}</button>
          ${d ? `<button class="btn spotify" id="mlResume">▶ Resume (round ${d.i + 1}/${d.list.length})</button>` : ''}
        </div>
        <p class="hint mt" id="mlPhones"></p>
      </div>
      <div class="card">
        <h2>Your own prompts</h2>
        <p class="hint">One per line, always included. Just write the ending, e.g. <i>sing in the shower</i>.</p>
        <textarea class="short" id="mlCustom" placeholder="sing in the shower&#10;end up dancing with the DJ">${esc(M.custom)}</textarea>
      </div>
    </div>`;
    const read = () => {
      M.packs = [...host.querySelectorAll('[data-mpack]')].filter(c => c.checked).map(c => c.dataset.mpack);
      M.count = Math.max(1, parseInt($('#mlCount').value, 10) || 15);
      M.timer = Math.max(5, parseInt($('#mlTimer').value, 10) || 20);
      M.custom = $('#mlCustom').value;
      M.sound = $('#mlSound').checked;
      save();
      $('#mlNew').disabled = !prompts().length;
    };
    host.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', read));
    $('#mlNew').onclick = () => {
      read();
      if (M.deck && M.deck.i > 0 && !confirm('Start a new game? The current scores will be cleared.')) return;
      newDeck(); startRound();
    };
    if (d) $('#mlResume').onclick = () => { read(); M.deck.done ? renderEnd() : renderStage(); };
    renderPhoneHint();
  }
  function renderPhoneHint() {
    const el = $('#mlPhones');
    if (!el) return;
    const l = live(), n = l ? l.players().length : 0;
    el.innerHTML = n >= 2 ? `📱 ${n} players on phones: they'll vote on their phones.`
      : l ? `📱 ${n} player${n === 1 ? '' : 's'} on phones. At least two are needed to vote, so for now it's the pointing version.`
      : 'No phones connected, so it\'s the pointing version. To vote on phones, start a live game in <b>1 📱 Let players join</b>.';
  }

  // ---------- Playing ----------
  function stop() { clearInterval(timerId); timerId = null; clearTimeout(autoTimer); }
  function startRound() {
    const d = M.deck, l = phones();
    d.revealed = false; d.results = null;
    d.choices = l ? l.players().map(p => ({ id: p.id, name: p.name })) : null;
    save(); renderStage();
  }
  function announce() {
    const l = live(), d = M.deck;
    if (!l) return;
    l.update({ mode: 'mlt', mlt: {
      key: key(), i: d.i, total: d.list.length, prompt: d.list[d.i], choices: d.choices || [],
      revealed: !!d.revealed, results: d.results || null, done: !!d.done, hall: d.done ? hall() : null
    } });
  }

  function renderStage() {
    stop();
    const d = M.deck, prompt = d.list[d.i], voting = !!d.choices;
    const last = d.i === d.list.length - 1;
    host.innerHTML = `<div class="qstage" id="mlStage">
      <div class="qtop">
        <span class="pill warn">🙋 Round ${d.i + 1} / ${d.list.length}</span>
        <span class="qtime" id="mlTime"></span>
        <span class="row"><button class="btn" id="mlSoundBtn" title="Sound effects on/off" aria-pressed="${M.sound}">${M.sound ? '🔊' : '🔇'}</button><button class="btn" id="mlFull" title="Fullscreen">⛶</button><button class="btn" id="mlExit">Menu</button></span>
      </div>
      <p class="mlwho">Who's most likely to…</p>
      <h2 class="qq">${esc(prompt)}?</h2>
      ${d.revealed && d.results ? resultsHtml(d.results)
        : voting ? `<p class="qlive" id="mlCount"></p>`
        : `<div class="mlpoint" id="mlPoint">Ready?</div>`}
      <div class="qnav">
        <button class="btn" id="mlSkip">Skip</button>
        <button class="btn primary" id="mlNext">${voting && !d.revealed ? 'Reveal votes' : !voting && !d.pointed ? '3… 2… 1… Point!' : last ? 'Finish 🏆' : 'Next ▶'}</button>
      </div>
    </div>`;
    $('#mlExit').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); renderSetup(); };
    $('#mlFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else host.requestFullscreen && host.requestFullscreen().catch(() => {}); };
    $('#mlSoundBtn').onclick = e => {
      M.sound = !M.sound; save();
      e.currentTarget.textContent = M.sound ? '🔊' : '🔇'; e.currentTarget.setAttribute('aria-pressed', String(M.sound));
    };
    $('#mlSkip').onclick = () => advance();
    $('#mlNext').onclick = () => {
      if (voting && !d.revealed) reveal();
      else if (!voting && !d.pointed) countdown();
      else advance();
    };
    if (voting && !d.revealed) { startTimer(); updateCount(); }
    announce();
  }
  function startTimer() {
    let left = M.timer;
    const tick = () => {
      const el = $('#mlTime'); if (!el) return stop();
      el.textContent = left > 0 ? `⏱ ${left}s` : "⏰ Time's up!";
      el.classList.toggle('low', left <= 5);
      if (left > 0 && left <= 5) SFX.tick();
      if (left <= 0) { stop(); SFX.buzzer(); autoTimer = setTimeout(reveal, 600); }
      left--;
    };
    tick(); timerId = setInterval(tick, 1000);
  }
  function countdown() {
    const el = $('#mlPoint'), steps = ['3…', '2…', '1…', 'POINT! 👉'];
    let n = 0;
    $('#mlNext').disabled = true;
    const go = () => {
      el.textContent = steps[n]; el.classList.toggle('go', n === 3);
      n === 3 ? SFX.fanfare() : SFX.beep(n);
      if (++n < steps.length) setTimeout(go, 800);
      else setTimeout(() => {
        M.deck.pointed = true; save();
        el.insertAdjacentHTML('afterend', '<p class="qsip">👑 Whoever gets the most fingers pointed at them wins the round!</p>');
        $('#mlNext').disabled = false;
        $('#mlNext').textContent = M.deck.i === M.deck.list.length - 1 ? 'Finish 🏆' : 'Next ▶';
      }, 400);
    };
    go();
  }
  function votes() {
    const d = M.deck, l = live(), k = key();
    const counts = d.choices.map(c => ({ ...c, votes: 0 }));
    if (l) l.players().forEach(p => { const v = p.answers && p.answers[k]; if (typeof v === 'number' && counts[v]) counts[v].votes++; });
    return counts;
  }
  function updateCount() {
    const el = $('#mlCount'), d = M.deck, l = live();
    if (!el || !d || !d.choices || d.revealed || !l) return;
    const k = key(), voters = l.players().filter(p => p.answers && typeof p.answers[k] === 'number').length;
    el.textContent = `📱 ${voters} of ${l.players().length} voted`;
    if (voters && voters >= l.players().length) { clearTimeout(autoTimer); autoTimer = setTimeout(reveal, 1000); }
  }
  function reveal() {
    const d = M.deck;
    if (!d || d.revealed || !d.choices || !$('#mlStage')) return;
    stop();
    d.results = votes().filter(r => r.votes > 0).sort((a, b) => b.votes - a.votes);
    const top = d.results.length ? d.results[0].votes : 0;
    d.results.filter(r => r.votes === top).forEach(r => { M.tally[r.name] = (M.tally[r.name] || 0) + 1; });
    d.revealed = true; save(); renderStage();
    SFX.reveal();
  }
  function resultsHtml(results) {
    if (!results.length) return '<p class="qsip">Nobody voted this time!</p>';
    const top = results[0].votes, max = top || 1;
    const winners = results.filter(r => r.votes === top).map(r => esc(r.name));
    return `<div class="mlbars">${results.map(r => `<div class="mlbar${r.votes === top ? ' win' : ''}">
        <span class="mln">${r.votes === top ? '👑 ' : ''}${esc(r.name)}</span>
        <span class="mlt"><i style="width:${Math.round(100 * r.votes / max)}%"></i></span><b>${r.votes}</b></div>`).join('')}</div>
      <p class="qsip">🙋 It's ${winners.join(' & ')}!</p>`;
  }
  function advance() {
    const d = M.deck;
    d.pointed = false;
    if (d.i >= d.list.length - 1) { d.done = true; save(); renderEnd(); return; }
    d.i++; startRound();
  }
  const hall = () => Object.entries(M.tally).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);

  function renderEnd() {
    stop();
    const h = hall();
    if (!M.deck.recorded && window.boozyStats) {
      window.boozyStats.record({ id: `mlt_${M.deck.id}`, game: 'mlt', title: "Who's Most Likely To", rounds: M.deck.list.length,
        players: h.map(r => ({ name: r.name, picks: r.n })), winner: h.length ? h.filter(r => r.n === h[0].n).map(r => r.name).join(' & ') : '' });
      M.deck.recorded = true; save();
    }
    host.innerHTML = `<div class="qstage">
      <div class="qtop"><span class="pill ok">Game over</span><span></span><button class="btn" id="mlExit">Menu</button></div>
      <h2 class="qq">🏆 Hall of fame</h2>
      ${h.length ? `<ol class="qboard">${h.map((r, i) => `<li class="${i === 0 ? 'win' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(r.name)}</span><b>${r.n}×</b></li>`).join('')}</ol>
        <p class="qsip">${esc(h[0].name)} is the most likely to… everything! 🏆</p>`
        : '<p class="hint" style="text-align:center">Played the pointing version, so there are no scores to show. Hope everyone had fun!</p>'}
      <div class="qnav"><button class="btn" id="mlBack">◀ Back</button><button class="btn primary" id="mlAgain">Play again</button></div>
    </div>`;
    $('#mlExit').onclick = renderSetup;
    $('#mlBack').onclick = () => { M.deck.done = false; save(); renderStage(); };
    $('#mlAgain').onclick = () => { newDeck(); startRound(); };
    announce();
  }

  window.addEventListener('boozy:players', () => { updateCount(); renderPhoneHint(); });
  host.addEventListener('pointerdown', () => { if (M.sound) SFX.unlock(); });

  if (M.deck && M.deck.done) renderEnd();
  else if (M.deck) renderStage();
  else renderSetup();
};
