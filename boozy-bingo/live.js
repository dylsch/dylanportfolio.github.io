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
    render();
  }

  function listen() {
    unsubs.forEach(u => u());
    unsubs = [
      fs.onSnapshot(gameRef(), snap => {
        if (!snap.exists() || snap.data().mode === 'ended') { gameId = null; game = null; setId(null); render(); return; }
        game = snap.data(); render(); renderQuizInfo();
      }, e => { toast('⚠️ Live game: ' + e.message); gameId = null; setId(null); render(); }),
      fs.onSnapshot(fs.collection(db, 'games', gameId, 'players'), snap => {
        players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        players.forEach(checkBingo);
        render(); renderQuizInfo();
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
  const qKey = q => `${q.round}_${q.i}`;
  window.addEventListener('boozy:quiz', e => {
    const q = lastQuiz = e.detail;
    if (!game) return;
    const data = {
      mode: 'quiz', 'quiz.round': q.round, 'quiz.i': q.i, 'quiz.total': q.total, 'quiz.q': q.q, 'quiz.opts': q.opts,
      'quiz.revealed': !!q.revealed, 'quiz.answer': q.revealed ? q.answer : null, 'quiz.done': !!q.done
    };
    const results = (game.quiz && game.quiz.results) || {};
    if (q.revealed && !results[qKey(q)]) {
      const right = players.filter(p => p.answers && p.answers[qKey(q)] === q.answer).map(p => p.id);
      data['quiz.results.' + qKey(q)] = right;
      results[qKey(q)] = right;
    }
    if (q.revealed || q.done) data['quiz.board'] = board(q.round, results);
    update(data);
    renderQuizInfo();
  });
  function board(round, results) {
    return players.map(p => ({ name: p.name, pts: Object.entries(results).filter(([k, l]) => k.startsWith(round + '_') && l.includes(p.id)).length }))
      .sort((a, b) => b.pts - a.pts);
  }
  // A line on the big-screen quiz showing how many phones have answered.
  function renderQuizInfo() {
    const el = $('#qzLive');
    if (!el) return;
    if (!game || !lastQuiz || !players.length || lastQuiz.done) { el.textContent = ''; return; }
    const k = qKey(lastQuiz);
    const answered = players.filter(p => p.answers && p.answers[k] !== undefined);
    if (!lastQuiz.revealed) el.textContent = `📱 ${answered.length} of ${players.length} phones answered`;
    else {
      const right = ((game.quiz && game.quiz.results && game.quiz.results[k]) || []).map(id => (players.find(p => p.id === id) || {}).name).filter(Boolean);
      el.textContent = right.length ? `📱 Right on their phones: ${right.join(', ')}` : '📱 Nobody got it right on their phone. Everyone drinks!';
    }
  }
  window.addEventListener('boozy:quiz-rendered', renderQuizInfo);

  // ---------- UI ----------
  function render() {
    if (!gameId || !game) {
      const st = app.getState(), need = app.cellsNeeded();
      host.innerHTML = `<div class="grid2"><div class="card">
        <h2>📱 Play on phones</h2>
        <p class="hint">Start a live game and show the QR code. Friends scan it, type their name and play on their phones. No app or login needed.</p>
        <ul class="hint">
          <li><b>Bingo:</b> everyone gets their own card on their phone. Tick songs off in the <b>Host the game</b> tab, and a tap on BINGO is checked automatically.</li>
          <li><b>Quiz:</b> run the Halloween quiz as normal. Questions appear on every phone with A–D buttons, and scores are counted for you.</li>
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
    const url = joinUrl(), results = (game.quiz && game.quiz.results) || {};
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
          <p class="hint">Phones are showing: <b>${{ lobby: 'waiting screen', bingo: 'bingo card', quiz: 'quiz' }[game.mode] || game.mode}</b></p>
          <div class="row">
            <button class="btn${game.mode === 'bingo' ? ' primary' : ''}" data-mode="bingo" ${game.bingo.songs.length ? '' : 'disabled'}>🎵 Bingo</button>
            <button class="btn${game.mode === 'quiz' ? ' primary' : ''}" data-mode="quiz">🎃 Quiz</button>
            <button class="btn${game.mode === 'lobby' ? ' primary' : ''}" data-mode="lobby">⏸ Waiting screen</button>
          </div>
          <div class="lvplayers">${players.length ? players.map(p => {
            const pts = round ? Object.entries(results).filter(([k, l]) => k.startsWith(round + '_') && l.includes(p.id)).length : 0;
            const b = p.bingoResult;
            return `<div class="lvp"><b>${esc(p.name)}</b>
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

  $('#liveTabBtn').hidden = false;
  if (gameId) listen(); else render();
};
