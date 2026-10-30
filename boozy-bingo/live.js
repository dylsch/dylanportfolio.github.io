// Boozy Bingo: live game host. Players scan a QR code and play on their phones (play.html).
// Started by gate.js once the host is signed in, because live games run through Firestore.
window.startBoozyLive = ctx => {
  'use strict';
  const { db, fs, user } = ctx;

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = $('#tab-live');
  const app = window.boozyApp;
  const KEY = 'boozyBingo.liveGame';
  const getId = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const setId = v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} };

  let gameId = getId(), game = null, players = [], unsubs = [], lastQuiz = null;
  const feed = [];

  const gameRef = () => fs.doc(db, 'games', gameId);
  const joinUrl = () => new URL('play.html?g=' + gameId, location.href).href;
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 4500); };
  const update = data => gameId && fs.updateDoc(gameRef(), data).catch(e => toast('⚠️ Live game: ' + e.message));

  function randomId() {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    return [...crypto.getRandomValues(new Uint8Array(10))].map(n => abc[n % abc.length]).join('');
  }
  function qrSvg(text, cell) {
    const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  }

  // ---------- Game lifecycle ----------
  async function startGame() {
    const st = app.getState(), need = app.cellsNeeded();
    gameId = randomId();
    await fs.setDoc(gameRef(), {
      hostUid: user.uid, title: st.title, open: true, mode: 'lobby', createdAt: fs.serverTimestamp(),
      bingo: {
        grid: st.grid, free: !!(st.free && st.grid % 2), need,
        songs: st.songs.length >= need ? st.songs.map(s => ({ k: app.songKey(s), t: s.title, a: s.artist })) : [],
        played: st.played.slice()
      },
      quiz: { results: {} }
    });
    setId(gameId);
    listen();
  }
  async function endGame() {
    if (!confirm('End the live game? Phones will show "Game over".')) return;
    await update({ open: false, mode: 'ended' });
    unsubs.forEach(u => u()); unsubs = [];
    gameId = null; game = null; players = []; setId(null);
    render(); renderTeams();
  }

  function listen() {
    unsubs.forEach(u => u());
    unsubs = [
      fs.onSnapshot(gameRef(), snap => {
        if (!snap.exists() || snap.data().mode === 'ended') { gameId = null; game = null; setId(null); render(); return; }
        const first = !game;
        game = snap.data(); render(); renderQuizInfo();
        if (first) renderTeams();
      }, e => { toast('⚠️ Live game: ' + e.message); gameId = null; setId(null); render(); }),
      fs.onSnapshot(fs.collection(db, 'games', gameId, 'players'), snap => {
        players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        players.forEach(checkBingo);
        render(); renderQuizInfo(); renderTeams(); checkAllAnswered();
        window.dispatchEvent(new Event('boozy:players'));
      })
    ];
  }

  // ---------- Bingo ----------
  const ms = t => (t && t.toMillis) ? t.toMillis() : 0;
  function checkBingo(p) {
    if (!p.bingoAt || !p.card || (p.bingoResult && p.bingoResult.claim === ms(p.bingoAt))) return;
    const g = game.bingo.grid, center = game.bingo.free ? Math.floor(g * g / 2) : -1;
    const played = new Set(app.getState().played);
    const marked = []; let j = 0;
    for (let c = 0; c < g * g; c++) marked.push(c === center ? true : played.has(p.card[j++]));
    const L = [];
    for (let r = 0; r < g; r++) L.push([...Array(g)].map((_, c) => r * g + c));
    for (let c = 0; c < g; c++) L.push([...Array(g)].map((_, r) => r * g + c));
    L.push([...Array(g)].map((_, i) => i * g + i), [...Array(g)].map((_, i) => i * g + (g - 1 - i)));
    const lines = L.filter(l => l.every(i => marked[i])).length, full = marked.every(Boolean);
    const ok = lines > 0;
    fs.updateDoc(fs.doc(db, 'games', gameId, 'players', p.id), { bingoResult: { claim: ms(p.bingoAt), ok, lines, full } })
      .catch(e => toast('⚠️ ' + e.message));
    const msg = ok ? `🎉 ${p.name} has a valid BINGO! (${full ? 'FULL HOUSE' : lines + ' line' + (lines > 1 ? 's' : '')})` : `🙅 ${p.name} called a false bingo. Finish your drink!`;
    feed.unshift({ msg, ok, at: Date.now() }); feed.length = Math.min(feed.length, 20);
    toast(msg);
  }
  window.addEventListener('boozy:played', e => {
    if (!game) return;
    update({ 'bingo.played': e.detail.slice(), ...(game.mode !== 'bingo' ? { mode: 'bingo' } : {}) });
  });

  // ---------- Quiz ----------
  // Scoring: a right answer earns 500 points plus up to 500 more the faster it came in, timed
  // between server timestamps so phone clocks don't matter. A team scores the total of its members.
  const qKey = q => `${q.round}_${q.i}`;
  const quizResults = () => (game && game.quiz && game.quiz.results) || {};
  const playerPts = (id, round, results = quizResults()) => Object.entries(results)
    .filter(([k]) => k.startsWith(round + '_')).reduce((n, [, r]) => n + ((r[id] && r[id].pts) || 0), 0);
  const teamNames = () => (window.boozyQuiz ? window.boozyQuiz.teams() : []);
  const secs = ms => (ms / 1000).toFixed(1) + 's';
  let allAnsweredKey = null;

  window.addEventListener('boozy:quiz', e => {
    const q = lastQuiz = e.detail;
    if (!game) return;
    const key = qKey(q);
    const data = {
      mode: 'quiz', 'quiz.round': q.round, 'quiz.i': q.i, 'quiz.total': q.total, 'quiz.q': q.q, 'quiz.opts': q.opts,
      'quiz.revealed': !!q.revealed, 'quiz.answer': q.revealed ? q.answer : null, 'quiz.done': !!q.done,
      'quiz.timer': q.timer || 0, 'quiz.standings': !!q.standings, teams: teamNames()
    };
    if (!q.revealed && !q.done && (game.quiz || {}).key !== key) { data['quiz.key'] = key; data['quiz.askedAt'] = fs.serverTimestamp(); }
    const results = { ...quizResults() };
    if (q.revealed && !results[key]) {
      results[key] = score(q, key);
      data['quiz.results.' + key] = results[key];
      const best = Object.entries(results[key]).sort((a, b) => a[1].ms - b[1].ms)[0];
      data['quiz.fastest'] = best ? { key, name: (players.find(p => p.id === best[0]) || {}).name || '?', ms: best[1].ms } : { key, name: null };
    }
    if (q.revealed || q.done) Object.assign(data, boards(q.round, results));
    update(data);
    renderQuizInfo(); checkAllAnswered();
  });

  function score(q, key) {
    const asked = ms(game.quiz && game.quiz.askedAt), scale = (q.timer || 20) * 1000, out = {};
    players.forEach(p => {
      if (!p.answers || p.answers[key] !== q.answer) return;
      const t = ms(p.times && p.times[key]);
      const took = asked && t ? Math.max(0, t - asked) : scale;
      out[p.id] = { pts: Math.round(500 + 500 * Math.max(0, 1 - took / scale)), ms: took };
    });
    return out;
  }
  function boards(round, results) {
    const board = players.map(p => ({ id: p.id, name: p.name, team: p.team || '', pts: playerPts(p.id, round, results) }))
      .sort((a, b) => b.pts - a.pts);
    const totals = {};
    board.forEach(b => { if (b.team) totals[b.team] = (totals[b.team] || 0) + b.pts; });
    const teamBoard = Object.entries(totals).map(([team, pts]) => ({ team, pts })).sort((a, b) => b.pts - a.pts);
    return { 'quiz.board': board, 'quiz.teamBoard': teamBoard };
  }

  // Tell quiz.js once every phone has answered, so it can auto-reveal.
  function checkAllAnswered() {
    const q = lastQuiz;
    if (!game || !q || q.revealed || q.done || !players.length) return;
    const key = qKey(q);
    if (allAnsweredKey !== key && players.every(p => p.answers && p.answers[key] !== undefined)) {
      allAnsweredKey = key;
      window.dispatchEvent(new CustomEvent('boozy:all-answered', { detail: key }));
    }
  }

  // Live info on the big-screen quiz: answer count, fastest player, team standings.
  function renderQuizInfo() {
    const el = $('#qzLive');
    if (el) {
      if (!game || !lastQuiz || !players.length || lastQuiz.done) el.textContent = '';
      else {
        const k = qKey(lastQuiz), r = quizResults()[k];
        if (!lastQuiz.revealed) el.textContent = `📱 ${players.filter(p => p.answers && p.answers[k] !== undefined).length} of ${players.length} phones answered`;
        else if (r) {
          const right = Object.entries(r).sort((a, b) => a[1].ms - b[1].ms).map(([id, x]) => `${(players.find(p => p.id === id) || {}).name || '?'} (${secs(x.ms)})`);
          el.textContent = right.length ? `⚡ Fastest: ${right[0]}${right.length > 1 ? ` · also right: ${right.slice(1).join(', ')}` : ''}` : '📱 Nobody got it right this time!';
        }
      }
    }
    const sc = $('#qzLiveScores');
    if (sc && game && lastQuiz) {
      const b = boards(lastQuiz.round, quizResults());
      const tb = b['quiz.teamBoard'];
      sc.innerHTML = tb.length
        ? `<div class="row qwho">${tb.map((t, i) => `<span class="pill ${i === 0 ? 'ok' : ''}" style="font-size:15px">${i === 0 ? '👑 ' : ''}${esc(t.team)}: ${t.pts}</span>`).join('')}</div>`
        : `<div class="row qwho">${b['quiz.board'].slice(0, 6).map((p, i) => `<span class="pill ${i === 0 ? 'ok' : ''}" style="font-size:15px">${esc(p.name)}: ${p.pts}</span>`).join('')}</div>`;
    }
    const fb = $('#qzLiveBoard');
    if (fb && game && lastQuiz) {
      const b = boards(lastQuiz.round, quizResults()), tb = b['quiz.teamBoard'], pb = b['quiz.board'];
      const list = (rows, label) => `<ol class="qboard">${rows.map((r, i) => `<li class="${i === 0 ? 'win' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(label(r))}</span><b>${r.pts}</b></li>`).join('')}</ol>`;
      fb.innerHTML = (tb.length ? list(tb, r => r.team) + '' + '<h3 style="text-align:center;margin-top:18px">Top players</h3>' : '')
        + list(pb.slice(0, tb.length ? 5 : 20), r => r.name + (r.team ? ` · ${r.team}` : ''));
    }
  }
  window.addEventListener('boozy:quiz-rendered', renderQuizInfo);

  // Team assignment panel on the quiz setup screen.
  function renderTeams() {
    const el = $('#qzTeams');
    if (!el) return;
    const names = teamNames();
    if (!game) {
      el.innerHTML = `<div class="card"><h2>📱 Phone teams</h2><p class="hint">Start a live game in <b>1 📱 Let players join</b> and show the QR code. Everyone who joins appears here, ready to be put into teams.</p></div>`;
      return;
    }
    const cols = [...names];
    if (players.some(p => !names.includes(p.team || ''))) cols.push('');
    el.innerHTML = `<div class="card">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">📱 Phone teams</h2><span class="pill">${players.length} on phones</span></div>
      <p class="hint">Put everyone in a team before you start. A right answer earns 500–1000 points (the faster, the more), and each team scores its members' total.</p>
      ${players.length ? `<div class="row">
          <button class="btn primary" id="tmShuffle" ${names.length ? '' : 'disabled'}>🎲 Shuffle into teams</button>
          <button class="btn" id="tmClear">Clear teams</button>
        </div>
        <div class="tmgrid">${cols.map(t => `<div class="tmcol"><h3>${t ? esc(t) : 'No team yet'}</h3>${players.filter(p => t ? p.team === t : !names.includes(p.team || '')).map(p => `
          <div class="tmp"><span>${esc(p.name)}</span><select data-team="${esc(p.id)}" aria-label="Team for ${esc(p.name)}">
            ${['', ...names].map(n => `<option value="${esc(n)}" ${n === (names.includes(p.team) ? p.team : '') ? 'selected' : ''}>${n ? esc(n) : 'No team'}</option>`).join('')}
          </select></div>`).join('') || '<p class="hint">Nobody yet</p>'}</div>`).join('')}</div>`
        : '<p class="hint">Nobody has joined yet. Show the QR code from <b>1 📱 Let players join</b>.</p>'}
    </div>`;
    const setTeam = (id, team) => fs.updateDoc(fs.doc(db, 'games', gameId, 'players', id), { team }).catch(err => toast('⚠️ ' + err.message));
    el.querySelectorAll('[data-team]').forEach(sel => sel.onchange = () => setTeam(sel.dataset.team, sel.value));
    const sh = $('#tmShuffle');
    if (sh) sh.onclick = () => {
      const order = players.map(p => p.id).sort(() => Math.random() - .5);
      Promise.all(order.map((id, i) => setTeam(id, names[i % names.length]))).then(() => toast('🎲 Teams shuffled'));
    };
    const cl = $('#tmClear');
    if (cl) cl.onclick = () => Promise.all(players.map(p => setTeam(p.id, '')));
  }
  window.addEventListener('boozy:quiz-setup', () => { renderTeams(); if (game) update({ teams: teamNames() }); });
  window.boozyLive = {
    playerCount: () => (game ? players.length : 0),
    active: () => !!game,
    players: () => (game ? players : []),
    update
  };

  // ---------- UI ----------
  function render() {
    if (!gameId || !game) {
      const st = app.getState(), need = app.cellsNeeded();
      host.innerHTML = `<div class="grid2"><div class="card">
        <h2>📱 Play on phones</h2>
        <p class="hint">Start a live game and show the QR code. Friends scan it, type their name and play on their phones. No app or login needed.</p>
        <ul class="hint">
          <li><b>Bingo:</b> everyone gets their own card on their phone. Tick songs off in the <b>Host the game</b> tab, and a tap on BINGO is checked automatically.</li>
          <li><b>Quiz:</b> run the Halloween or Christmas quiz as normal. Questions appear on every phone with A–D buttons, and scores are counted for you.</li>
        </ul>
        ${st.songs.length < need ? `<p class="pill warn">Only ${st.songs.length} songs saved, so phones get the quiz only. Add at least ${need} songs to include bingo cards.</p>` : `<p class="hint">Phones get ${st.grid}×${st.grid} cards from your ${st.songs.length} songs. The song list is locked in when the game starts.</p>`}
        <div class="row mt"><button class="btn primary" id="lvStart">Start live game</button></div>
      </div></div>`;
      $('#lvStart').onclick = async () => {
        $('#lvStart').disabled = true;
        try { await startGame(); } catch (e) { toast('⚠️ ' + e.message); $('#lvStart').disabled = false; }
      };
      return;
    }
    const url = joinUrl();
    const round = game.quiz && game.quiz.round;
    host.innerHTML = `<div class="grid2">
      <div class="card" style="text-align:center">
        <h2>Scan to join 🍹</h2>
        <div class="qrbox">${qrSvg(url, 8)}</div>
        <p class="hint" style="word-break:break-all">${esc(url)}</p>
        <div class="row" style="justify-content:center">
          <button class="btn primary" id="lvFull">⛶ Show QR on big screen</button>
          <button class="btn" id="lvCopy">Copy link</button>
        </div>
        <div class="row mt" style="justify-content:center">
          <button class="btn" id="lvOpen">${game.open ? '🔒 Close joining' : '🔓 Reopen joining'}</button>
          <button class="btn danger" id="lvEnd">End game</button>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="row" style="justify-content:space-between"><h2 style="margin:0">Players</h2><span class="pill ${game.open ? 'ok' : 'warn'}">${players.length} joined${game.open ? '' : ' · closed'}</span></div>
          <p class="hint">Phones are showing: <b>${{ lobby: 'waiting screen', bingo: 'bingo card', quiz: 'quiz', mlt: "who's most likely to", letters: 'letter rush' }[game.mode] || game.mode}</b></p>
          <div class="row">
            <button class="btn${game.mode === 'bingo' ? ' primary' : ''}" data-mode="bingo" ${game.bingo.songs.length ? '' : 'disabled'}>🎵 Bingo</button>
            <button class="btn${game.mode === 'quiz' ? ' primary' : ''}" data-mode="quiz">🧠 Quiz</button>
            <button class="btn${game.mode === 'mlt' ? ' primary' : ''}" data-mode="mlt">🙋 Most likely to</button>
            <button class="btn${game.mode === 'letters' ? ' primary' : ''}" data-mode="letters">🔤 Letter Rush</button>
            <button class="btn${game.mode === 'lobby' ? ' primary' : ''}" data-mode="lobby">⏸ Waiting screen</button>
          </div>
          <div class="lvplayers">${players.length ? players.map(p => {
            const pts = round ? playerPts(p.id, round) : 0;
            const b = p.bingoResult;
            return `<div class="lvp"><b>${esc(p.name)}</b>${p.team ? `<span class="pill">${esc(p.team)}</span>` : ''}
              ${b ? `<span class="pill ${b.ok ? 'ok' : 'bad'}">${b.ok ? (b.full ? 'FULL HOUSE' : 'BINGO') : 'false bingo'}</span>` : ''}
              ${round ? `<span class="pill">${pts} pts</span>` : ''}
              <button class="lvkick" data-kick="${esc(p.id)}" title="Remove player">✕</button></div>`;
          }).join('') : '<p class="hint">Nobody yet. Show them the QR code!</p>'}</div>
        </div>
        ${feed.length ? `<div class="card"><h2>Bingo calls</h2>${feed.map(f => `<p class="${f.ok ? '' : 'hint'}">${esc(f.msg)}</p>`).join('')}</div>` : ''}
      </div>
    </div>`;
    $('#lvFull').onclick = showBigQr;
    $('#lvCopy').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url));
    $('#lvOpen').onclick = () => update({ open: !game.open });
    $('#lvEnd').onclick = endGame;
    host.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => update({ mode: b.dataset.mode }));
    host.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => {
      const p = players.find(x => x.id === b.dataset.kick);
      if (p && confirm(`Remove ${p.name} from the game?`)) fs.deleteDoc(fs.doc(db, 'games', gameId, 'players', p.id)).catch(e => toast('⚠️ ' + e.message));
    });
  }

  function showBigQr() {
    const ov = document.createElement('div');
    ov.className = 'qroverlay';
    ov.innerHTML = `<div class="qrbig">${qrSvg(joinUrl(), 12)}</div>
      <h2>Scan to play ${esc(game.title || 'Boozy Bingo')} 🍹</h2>
      <p>Point your phone camera at the code</p><p class="hint">Click anywhere to close</p>`;
    ov.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); ov.remove(); };
    document.body.appendChild(ov);
    if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
  }

  if (gameId) listen(); else render();
};
