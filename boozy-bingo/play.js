// Boozy Bingo player page: friends scan the host's QR code and play on their phones.
// Players sign in anonymously (no Google account needed) under a separate Firebase app instance,
// so testing on the host's own device never signs the host out.
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.14.1/';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const gameId = new URLSearchParams(location.search).get('g');
const LETTERS = 'ABCD';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const screen = (icon, title, text) => {
  view.innerHTML = `<div class="card center"><div class="big">${icon}</div><h2>${title}</h2><p class="hint">${text}</p></div>`;
};
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

if (!gameId) screen('📷', 'Scan to join', "Scan the QR code on the host's screen to join the game.");
else main().catch(e => screen('📡', "Couldn't connect", esc(e.message || e) + '. Check your internet connection and refresh.'));

async function main() {
  const [{ initializeApp }, { getAuth, signInAnonymously, onAuthStateChanged }, fs] =
    await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(FIREBASE + f)));
  const app = initializeApp(window.BOOZY_FIREBASE, 'player');
  const auth = getAuth(app);
  const db = fs.getFirestore(app);

  const user = await new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, u => { if (u) { stop(); resolve(u); } });
    signInAnonymously(auth).catch(e => {
      reject(new Error(e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation'
        ? 'Guest sign-in is switched off in Firebase (Authentication → Sign-in method → Anonymous)' : e.message));
    });
  });

  const gameRef = fs.doc(db, 'games', gameId);
  const meRef = fs.doc(db, 'games', gameId, 'players', user.uid);
  const marksKey = `boozyBingo.marks.${gameId}`;
  let game = null, me = undefined, tab = null, lastMode = null, joining = false, bingoCooldown = false;
  let marks = new Set(store.get(marksKey, []));
  // When each question first appeared on this phone, for the on-screen countdown.
  const seenAt = {};
  const countdown = q => {
    const left = Math.max(0, Math.ceil(q.timer - (Date.now() - (seenAt[`${q.round}_${q.i}`] || Date.now())) / 1000));
    return left ? `⏱ ${left}s` : "⏰ Time's up";
  };
  setInterval(() => {
    const el = $('#qtime'), q = game && game.quiz;
    if (el && q && !q.revealed && q.timer) el.textContent = countdown(q);
    const lt = $('#lrtime'), l = game && game.letters;
    if (lt && l && !l.revealed) lt.textContent = lrCountdown(l);
  }, 500);
  const lrCountdown = l => {
    const left = Math.max(0, Math.ceil(l.timer - (Date.now() - (seenAt[l.key] || Date.now())) / 1000));
    return left ? `⏱ ${left}s` : "⏰ Time's up";
  };

  fs.onSnapshot(gameRef, snap => {
    game = snap.exists() ? snap.data() : null;
    if (game && game.mode !== lastMode) {
      if (game.mode === 'quiz' || game.mode === 'bingo') tab = game.mode;
      lastMode = game.mode;
    }
    render();
  }, e => screen('🚫', 'Game not available', esc(e.message)));
  fs.onSnapshot(meRef, snap => { me = snap.exists() ? snap.data() : null; render(); },
    () => { me = null; render(); });

  function render() {
    if (game === null) return screen('👻', 'Game not found', 'This game has ended or the link is wrong. Ask the host for the QR code.');
    if (!game || me === undefined) return;
    if (game.mode === 'ended') return screen('🏁', 'Game over', 'Thanks for playing! 🍻');
    if (!me) return renderJoin();
    joining = false;
    $('#me').innerHTML = `${esc(me.name)}<br>${me.team ? `<span class="team">${esc(me.team)}</span>` : esc(game.title || '')}`;

    if (game.mode === 'mlt') { view.innerHTML = mltHtml(); bindMlt(); return; }
    if (game.mode === 'letters') {
      // Keep whatever the player is typing when the page re-renders.
      const inp = $('#lrInput'), typed = inp ? inp.value : null, focused = inp && document.activeElement === inp;
      view.innerHTML = lettersHtml(); bindLetters();
      const now = $('#lrInput');
      if (now && typed !== null) { now.value = typed; if (focused) now.focus(); }
      return;
    }
    const hasBingo = !!(me.card && game.bingo && game.bingo.songs && game.bingo.songs.length);
    if (!tab) tab = hasBingo ? 'bingo' : 'quiz';
    if (tab === 'bingo' && !hasBingo) tab = 'quiz';
    const tabs = hasBingo ? `<div class="tabs">
      <button data-tab="bingo" class="${tab === 'bingo' ? 'active' : ''}">🎵 My card${game.mode === 'bingo' && tab !== 'bingo' ? '<span class="dot"></span>' : ''}</button>
      <button data-tab="quiz" class="${tab === 'quiz' ? 'active' : ''}">🎃 Quiz${game.mode === 'quiz' && tab !== 'quiz' ? '<span class="dot"></span>' : ''}</button>
    </div>` : '';
    view.innerHTML = tabs + (game.mode === 'lobby' && tab !== 'bingo'
      ? `<div class="card center"><div class="big">🎉</div><h2>You're in!</h2><p class="hint">Waiting for the host to start. Keep this page open.</p></div>`
      : tab === 'bingo' ? bingoHtml() : quizHtml());
    view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    bindBingo(); bindQuiz();
  }

  // ---------- Join ----------
  function renderJoin() {
    if (joining) return;
    joining = true;
    if (!game.open) { joining = false; return screen('🔒', 'Joining is closed', 'The host has closed this game to new players.'); }
    view.innerHTML = `<div class="card center"><div class="big">🍹</div><h2>Join ${esc(game.title || 'the game')}</h2>
      <p class="hint">What should we call you?</p>
      <input type="text" id="name" maxlength="30" autocomplete="nickname" placeholder="Your name" value="${esc(store.get('boozyBingo.name', ''))}">
      <button class="btn primary mt" id="join">Let's play</button></div>`;
    const go = async () => {
      const name = $('#name').value.trim().slice(0, 30);
      if (!name) { $('#name').focus(); return; }
      store.set('boozyBingo.name', name);
      $('#join').disabled = true;
      const b = game.bingo || {};
      const card = b.songs && b.songs.length >= b.need ? shuffle(b.songs.map(s => s.k)).slice(0, b.need) : null;
      try {
        await fs.setDoc(meRef, { name, card, joinedAt: fs.serverTimestamp(), answers: {}, times: {}, bingoAt: null });
      } catch (e) { joining = false; screen('⚠️', "Couldn't join", esc(e.message)); }
    };
    $('#join').onclick = go;
    $('#name').onkeydown = e => { if (e.key === 'Enter') go(); };
  }

  // ---------- Bingo ----------
  function bingoHtml() {
    const b = game.bingo, g = b.grid, center = b.free ? Math.floor(g * g / 2) : -1;
    const byKey = Object.fromEntries(b.songs.map(s => [s.k, s]));
    let cells = '', j = 0;
    for (let c = 0; c < g * g; c++) {
      if (c === center) { cells += '<div class="bcell free">FREE<br>🍹</div>'; continue; }
      const k = me.card[j++], s = byKey[k] || { t: k, a: '' };
      cells += `<div class="bcell${marks.has(k) ? ' on' : ''}" data-k="${esc(k)}"><span class="t">${esc(s.t)}</span>${s.a ? `<span class="a">${esc(s.a)}</span>` : ''}</div>`;
    }
    const r = me.bingoResult, pending = me.bingoAt && (!r || r.claim !== me.bingoAt.toMillis());
    return `<div class="bgrid g${g}" style="grid-template-columns:repeat(${g},1fr)">${cells}</div>
      <p class="hint center mt">Tap a song when you hear it. Got a full line? Shout it with the button!</p>
      <button class="btn bingo" id="bingo" ${pending || bingoCooldown ? 'disabled' : ''}>${pending ? 'Checking…' : 'BINGO!'}</button>
      ${r && !pending ? `<div class="verdict ${r.ok ? 'ok' : 'no'}">${r.ok
        ? `🎉 Valid BINGO! ${r.full ? 'FULL HOUSE!' : r.lines + ' line' + (r.lines > 1 ? 's' : '')}. Everyone else drinks!`
        : '🙅 False bingo! Not all those songs have played yet. Finish your drink 🍺'}</div>` : ''}`;
  }
  function bindBingo() {
    view.querySelectorAll('.bcell[data-k]').forEach(c => c.onclick = () => {
      const k = c.dataset.k;
      marks.has(k) ? marks.delete(k) : marks.add(k);
      store.set(marksKey, [...marks]);
      c.classList.toggle('on', marks.has(k));
    });
    const btn = $('#bingo');
    if (btn) btn.onclick = async () => {
      bingoCooldown = true; btn.disabled = true;
      setTimeout(() => { bingoCooldown = false; render(); }, 8000);
      try { await fs.updateDoc(meRef, { bingoAt: fs.serverTimestamp() }); } catch (e) { alert(e.message); }
    };
  }

  // ---------- Who's most likely to ----------
  function mltHtml() {
    const m = game.mlt;
    if (!m) return `<div class="card center"><div class="big">🙋</div><h2>Who's most likely to…</h2><p class="hint">Get ready! The first prompt is coming up.</p></div>`;
    if (m.done) {
      const h = m.hall || [];
      return `<div class="card"><h2 class="center">🏆 Hall of fame</h2>${h.length ? `<ol class="board">${h.map((r, i) =>
        `<li class="${r.name === me.name ? 'mine' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(r.name)}</span><b>${r.n}×</b></li>`).join('')}</ol>` : '<p class="hint center">Thanks for playing!</p>'}</div>`;
    }
    const mine = me.answers ? me.answers[m.key] : undefined;
    const head = `<div class="qnum">Round ${m.i + 1} / ${m.total}</div><p class="mlwho">Who's most likely to…</p><h2 class="qq">${esc(m.prompt)}?</h2>`;
    if (m.revealed) {
      const res = m.results || [], top = res.length ? res[0].votes : 0;
      const winners = res.filter(r => r.votes === top);
      const meWin = winners.some(r => r.id === user.uid), myVotes = (res.find(r => r.id === user.uid) || {}).votes || 0;
      return `<div class="card">${head}${res.length ? `<ol class="board">${res.map(r =>
        `<li class="${r.id === user.uid ? 'mine' : ''}"><span>${r.votes === top ? '👑 ' : ''}${esc(r.name)}</span><b>${r.votes}</b></li>`).join('')}</ol>` : ''}
        <p class="sip" style="color:var(--pink)">${!res.length ? 'Nobody voted. Everybody drinks! 🍻' : meWin ? '🍺 That\'s you! Drink up!' : `🍺 ${winners.map(r => esc(r.name)).join(' & ')} ${winners.length > 1 ? 'drink' : 'drinks'}!`}</p>
        ${res.length && !meWin ? `<p class="hint center">You got ${myVotes} vote${myVotes === 1 ? '' : 's'}.</p>` : ''}</div>`;
    }
    if (!m.choices || !m.choices.length) return `<div class="card center">${head}<p class="sip">👉 On the count of three, point at someone!</p></div>`;
    return `<div class="card">${head}<div class="opts">${m.choices.map((c, k) =>
      `<button class="opt ${k === mine ? 'sel' : ''}" data-vote="${k}"><b>${esc((c.name || '?').charAt(0).toUpperCase())}</b><span>${esc(c.name)}${c.id === user.uid ? ' (you)' : ''}</span></button>`).join('')}</div>
      <p class="hint center mt">${mine === undefined ? 'Tap a name to vote. Votes are anonymous.' : 'Vote in! You can change it until the votes are revealed.'}</p></div>`;
  }
  function bindMlt() {
    view.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => {
      const m = game.mlt;
      if (!m || m.revealed) return;
      fs.updateDoc(meRef, { [`answers.${m.key}`]: Number(b.dataset.vote) }).catch(e => alert(e.message));
    });
  }

  // ---------- Letter Rush ----------
  function lettersHtml() {
    const l = game.letters;
    if (!l) return `<div class="card center"><div class="big">🔤</div><h2>Letter Rush</h2><p class="hint">Get ready! A letter and a category are coming up.</p></div>`;
    const board = (l.board || []).length ? `<ol class="board">${l.board.map((b, i) =>
      `<li class="${b.id === user.uid ? 'mine' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(b.name)}</span><b>${b.pts}</b></li>`).join('')}</ol>` : '';
    if (l.done) return `<div class="card"><h2 class="center">🏆 Final scores</h2>${board || '<p class="hint center">Thanks for playing!</p>'}</div>`;
    if (l.standings) return `<div class="card"><h2 class="center">📊 Leaderboard</h2><p class="hint center">After round ${l.i + 1} of ${l.total}. Next round coming up!</p>${board}</div>`;
    const head = `<div class="qhead"><span class="qnum">Round ${l.i + 1} / ${l.total}</span>${l.letter && !l.revealed ? `<span class="qtime" id="lrtime">${lrCountdown(l)}</span>` : ''}</div>
      <h2 class="qq">${esc(l.category)}</h2><p class="mlwho">starting with</p><div class="lrbig">${l.letter || '?'}</div>`;
    if (!l.letter) return `<div class="card center">${head}<p class="hint">Picking a letter…</p></div>`;
    if (!seenAt[l.key]) seenAt[l.key] = Date.now();
    const mine = me.answers ? me.answers[l.key] : undefined;
    if (l.revealed) {
      const res = l.results || [], my = res.find(r => r.id === user.uid);
      const msg = !my ? '' : {
        unique: `✅ Unique answer! +10`, shared: '🤝 Someone had the same answer: +5. Copycats sip! 🍺',
        wrong: `❌ That doesn't start with ${esc(l.letter)}. Sip! 🍺`, rejected: '🙅 The host didn\'t accept that one. Sip! 🍺', blank: '⏰ No answer. Sip! 🍺'
      }[my.status];
      return `<div class="card">${head}${msg ? `<p class="sip">${msg}</p>` : ''}
        <div class="lrlist">${res.map(r => `<div class="${r.id === user.uid ? 'mine' : ''}"><span>${esc(r.name)}</span><b class="${r.status}">${r.answer ? esc(r.answer) : '—'}</b><small>${r.pts ? '+' + r.pts : '0'}</small></div>`).join('')}</div>
        ${board ? `<h3 class="center mt">Scores</h3>${board}` : ''}</div>`;
    }
    return `<div class="card">${head}
      <input type="text" id="lrInput" maxlength="40" autocomplete="off" autocapitalize="words" placeholder="Your answer…" class="mt">
      <button class="btn primary mt" id="lrSend">${mine ? 'Change answer' : 'Send'}</button>
      <p class="hint center mt">${mine ? `✅ Locked in: <b>${esc(mine)}</b>. You can change it until time runs out.` : 'Unique answers score 10, answers someone else also gave score 5.'}</p></div>`;
  }
  function bindLetters() {
    const btn = $('#lrSend'), inp = $('#lrInput');
    if (!btn) return;
    const send = () => {
      const l = game.letters, v = inp.value.trim().slice(0, 40);
      if (!l || l.revealed || !v) { inp.focus(); return; }
      inp.value = '';
      fs.updateDoc(meRef, { [`answers.${l.key}`]: v }).catch(e => alert(e.message));
    };
    btn.onclick = send;
    inp.onkeydown = e => { if (e.key === 'Enter') send(); };
  }

  // ---------- Quiz ----------
  function quizHtml() {
    const q = game.quiz || {};
    const mineIn = rows => rows.findIndex(b => b.id === user.uid);
    if (q.standings && q.board && !q.done) {
      const tb = q.teamBoard || [];
      return `<div class="card"><h2 class="center">📊 Leaderboard</h2><p class="hint center">After question ${q.i + 1} of ${q.total}. Next question coming up!</p>
        ${tb.length ? `<ol class="board">${tb.map((t, i) => `<li class="${t.team === me.team ? 'mine' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(t.team)}</span><b>${t.pts}</b></li>`).join('')}</ol><h3 class="center mt">Players</h3>` : ''}
        <ol class="board">${q.board.map((b, i) => `<li class="${b.id === user.uid ? 'mine' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(b.name)}</span><b>${b.pts}</b></li>`).join('')}</ol></div>`;
    }
    if (q.done && q.board) {
      const tb = q.teamBoard || [], last = tb.length > 1 && tb[0].pts !== tb[tb.length - 1].pts ? tb[tb.length - 1].team : null;
      return `<div class="card"><h2 class="center">🏆 Final scores</h2>
        ${tb.length ? `<ol class="board">${tb.map((t, i) => `<li class="${t.team === me.team ? 'mine' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(t.team)}</span><b>${t.pts}</b></li>`).join('')}</ol>
          ${last && last === me.team ? '<p class="sip">🍻 Your team came last: finish your drink!</p>' : ''}
          <h3 class="center mt">Players</h3>` : ''}
        <ol class="board">${q.board.map((b, i) => `<li class="${b.id === user.uid ? 'mine' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(b.name)}</span><b>${b.pts}</b></li>`).join('')}</ol>
        ${!tb.length && q.board.length > 1 && mineIn(q.board) === q.board.length - 1 && q.board[0].pts !== q.board[q.board.length - 1].pts ? '<p class="sip">🍻 Last place: finish your drink!</p>' : ''}</div>`;
    }
    if (!q.q) return `<div class="card center"><div class="big">🎃</div><h2>Quiz coming up</h2><p class="hint">The questions will appear here when the host starts the quiz.${me.team ? `<br>You're on <b>${esc(me.team)}</b>.` : ''}</p></div>`;
    const key = `${q.round}_${q.i}`, mine = me.answers ? me.answers[key] : undefined;
    if (!seenAt[key]) seenAt[key] = Date.now();
    const opts = q.opts.map((o, k) => {
      let cls = '';
      if (q.revealed) cls = k === q.answer ? 'right' : k === mine ? 'wrong' : 'dim';
      else if (k === mine) cls = 'sel';
      return `<button class="opt ${cls}" data-opt="${k}" ${q.revealed ? 'disabled' : ''}><b>${LETTERS[k]}</b><span>${esc(o)}</span></button>`;
    }).join('');
    let foot = '';
    if (q.revealed) {
      const res = q.results && q.results[key] && q.results[key][user.uid];
      foot = res ? `<p class="sip" style="color:var(--green)">✅ Correct! +${res.pts} pts (${(res.ms / 1000).toFixed(1)}s)</p>`
        : `<p class="sip" style="color:var(--pink)">🍺 ${mine === undefined ? 'Too slow!' : 'Wrong!'} Take a sip!</p>`;
      if (q.fastest && q.fastest.key === key && q.fastest.name) foot += `<p class="hint center">⚡ Fastest: <b>${esc(q.fastest.name)}</b> (${(q.fastest.ms / 1000).toFixed(1)}s)</p>`;
    } else foot = `<p class="hint center mt">${mine === undefined ? 'Quick! The faster you answer, the more points you get.' : 'Answer locked in. You can change it until the answer is revealed, but your time restarts.'}</p>`;
    const myRow = q.board ? q.board.find(b => b.id === user.uid) : null;
    const myTeam = me.team && q.teamBoard ? q.teamBoard.find(t => t.team === me.team) : null;
    return `<div class="card"><div class="qhead"><span class="qnum">Question ${q.i + 1} / ${q.total}${myRow ? ` · ${myRow.pts} pts` : ''}${myTeam ? ` · ${esc(me.team)} ${myTeam.pts}` : ''}</span>
      ${!q.revealed && q.timer ? `<span class="qtime" id="qtime">${countdown(q)}</span>` : ''}</div>
      <h2 class="qq">${esc(q.q)}</h2><div class="opts">${opts}</div>${foot}</div>`;
  }
  function bindQuiz() {
    view.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
      const q = game.quiz;
      if (!q || q.revealed) return;
      const key = `${q.round}_${q.i}`;
      fs.updateDoc(meRef, { [`answers.${key}`]: Number(b.dataset.opt), [`times.${key}`]: fs.serverTimestamp() }).catch(e => alert(e.message));
    });
  }
}
