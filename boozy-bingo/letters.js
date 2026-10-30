// Boozy Bingo: Letter Rush. A random letter plus a category against the clock ("a fruit starting with B").
// Players type answers on their phones (via live.js); unique answers score 10, shared ones 5, as in the
// folk game "Stop / Tutti Frutti". Without phones, everyone shouts answers before the timer runs out.
window.startBoozyLetters = () => {
  'use strict';

  const KEY = 'boozyBingo.letters';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const host = $('#tab-letters');
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', HARD = 'QUVXYZ';

  const PACKS = {
    everyday: { name: 'Everyday', emoji: '🏠', list: [
      'A boy\'s name', 'A girl\'s name', 'Something in a kitchen', 'A piece of clothing', 'Something you take on holiday',
      'A job', 'A school subject', 'Something in a bathroom', 'A colour', 'A hobby', 'Something you find in a handbag',
      'A word to describe someone', 'Something with wheels', 'A brand', 'Something you can break', 'An excuse for being late',
      'A household chore', 'Something you plug in', 'A shop', 'A body part'
    ] },
    food: { name: 'Food & drink', emoji: '🍕', list: [
      'A fruit', 'A vegetable', 'A cocktail or mixed drink', 'A pizza topping', 'A dessert', 'A snack', 'A breakfast food',
      'A cheese', 'A spice or herb', 'Something you grill', 'A sandwich filling', 'A sweet or chocolate bar', 'A soft drink',
      'A dish from another country', 'Something at a buffet'
    ] },
    pop: { name: 'Pop culture', emoji: '🎬', list: [
      'A film', 'A TV show', 'A singer or band', 'A song title', 'A cartoon character', 'A famous person',
      'A superhero or villain', 'A video game', 'A book or author', 'A sports star', 'A Disney character', 'An app or website'
    ] },
    places: { name: 'Places', emoji: '🌍', list: [
      'A country', 'A capital city', 'A Maltese town or village', 'A holiday destination', 'A river, lake or sea',
      'Something you see at the beach', 'A place you\'d go on a date', 'A famous landmark', 'A European city', 'Somewhere you\'d hate to be stuck'
    ] },
    nature: { name: 'Nature & plants', emoji: '🌿', list: [
      'An animal', 'A bird', 'A flower', 'A houseplant', 'A tree', 'Something in a garden', 'An insect or creepy-crawly',
      'A sea creature', 'A type of weather', 'Something that grows', 'A pet\'s name', 'A herb you can grow'
    ] },
    party: { name: 'Party', emoji: '🪩', list: [
      'A reason to celebrate', 'Something you bring to a party', 'A dance move', 'A party game', 'Something said after too many drinks',
      'A karaoke song', 'A chat-up line word', 'Something you lose on a night out', 'A word to describe a hangover', 'A drinking toast'
    ] },
    seasonal: { name: 'Seasonal', emoji: '🎃', list: [
      'A Halloween costume', 'Something scary', 'A Christmas present', 'Something on a Christmas tree', 'A Christmas song or film',
      'Something you do in summer', 'An Easter treat', 'Something you pack for the beach', 'A winter word', 'A New Year\'s resolution'
    ] }
  };

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch {} };
  const M = Object.assign({ packs: ['everyday', 'food', 'pop', 'places'], custom: '', count: 10, timer: 30, easy: true, deck: null }, load());
  let timerId = null, autoTimer = null, rollId = null;

  const live = () => (window.boozyLive && window.boozyLive.active() ? window.boozyLive : null);
  const phones = () => { const l = live(); return l && l.players().length ? l : null; };

  // Letter check and duplicate matching ignore case, accents, Maltese dots/bars and a leading "the"/"a".
  const fold = s => String(s || '').toLowerCase().replace(/ħ/g, 'h').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^\s*(the|an|a|il-|l-)\s*/, '').replace(/[^a-z0-9]/g, '');
  const same = s => { const f = fold(s); return f.length > 3 ? f.replace(/e?s$/, '') : f; };

  const categories = () => [
    ...M.custom.split('\n').map(s => s.trim()).filter(Boolean),
    ...M.packs.flatMap(p => (PACKS[p] ? PACKS[p].list : []))
  ];
  function newDeck() {
    const own = M.custom.split('\n').filter(s => s.trim()).length, all = categories();
    const cats = shuffle([...all.slice(0, own), ...shuffle(all.slice(own)).slice(0, Math.max(0, M.count - own))]);
    const pool = [...ALPHABET].filter(l => !(M.easy && HARD.includes(l)));
    let last = '';
    const list = cats.map(category => {
      let letter; do { letter = pool[Math.floor(Math.random() * pool.length)]; } while (letter === last && pool.length > 1);
      last = letter;
      return { letter, category };
    });
    M.deck = { id: Date.now().toString(36), i: 0, list, rounds: {}, done: false };
    save();
  }
  const key = () => `lr_${M.deck.id}_${M.deck.i}`;
  const round = () => (M.deck.rounds[M.deck.i] = M.deck.rounds[M.deck.i] || { revealed: false, results: null, rolled: false });

  // ---------- Scoring ----------
  function scored(results, letter) {
    const L = letter.toLowerCase();
    const rows = results.map(r => {
      const status = !r.answer ? 'blank' : fold(r.answer)[0] !== L ? 'wrong' : r.reject ? 'rejected' : 'ok';
      return { ...r, status };
    });
    const groups = {};
    rows.filter(r => r.status === 'ok').forEach(r => { (groups[same(r.answer)] = groups[same(r.answer)] || []).push(r); });
    return rows.map(r => {
      if (r.status !== 'ok') return { ...r, pts: 0 };
      const shared = groups[same(r.answer)].length > 1;
      return { ...r, status: shared ? 'shared' : 'unique', pts: shared ? 5 : 10 };
    });
  }
  function board() {
    const totals = {};
    Object.entries(M.deck.rounds).forEach(([i, r]) => {
      if (!r.results) return;
      scored(r.results, M.deck.list[i].letter).forEach(x => {
        totals[x.id] = totals[x.id] || { name: x.name, pts: 0 };
        totals[x.id].name = x.name; totals[x.id].pts += x.pts;
      });
    });
    return Object.entries(totals).map(([id, t]) => ({ id, ...t })).sort((a, b) => b.pts - a.pts);
  }

  // ---------- Setup ----------
  function renderSetup() {
    stop();
    const d = M.deck, n = categories().length;
    host.innerHTML = `<div class="grid2">
      <div class="card">
        <h2>🔤 Letter Rush</h2>
        <p class="hint">Each round, the TV picks a random letter and a category, like <i>a fruit starting with B</i>. Answer before time runs out. A unique answer scores 10, one somebody else also gave scores 5, and no answer or a wrong letter costs a sip.</p>
        <label>Category packs</label>
        <div class="row">${Object.entries(PACKS).map(([id, p]) => `<label class="chip"><input type="checkbox" data-lpack="${id}" ${M.packs.includes(id) ? 'checked' : ''}> ${p.emoji} ${p.name} <small>(${p.list.length})</small></label>`).join('')}</div>
        <div class="fields">
          <div><label for="lrCount">Rounds</label><input type="number" id="lrCount" min="1" max="100" value="${M.count}"></div>
          <div><label for="lrTimer">Time per round (seconds)</label><input type="number" id="lrTimer" min="5" max="180" value="${M.timer}"></div>
        </div>
        <label class="check"><input type="checkbox" id="lrEasy" ${M.easy ? 'checked' : ''}> Leave out the hard letters (Q, U, V, X, Y, Z)</label>
        <div class="row mt">
          <button class="btn primary" id="lrNew" ${n ? '' : 'disabled'}>${d ? 'New game' : 'Start game'}</button>
          ${d ? `<button class="btn spotify" id="lrResume">▶ ${d.done ? 'Show results' : `Resume (round ${d.i + 1}/${d.list.length})`}</button>` : ''}
        </div>
        <p class="hint mt" id="lrPhones"></p>
      </div>
      <div class="card">
        <h2>Your own categories</h2>
        <p class="hint">One per line, always included, e.g. <i>Something you'd find in Valletta</i>.</p>
        <textarea class="short" id="lrCustom" placeholder="Something you'd find in Valletta&#10;A reason to call in sick">${esc(M.custom)}</textarea>
      </div>
    </div>`;
    const read = () => {
      M.packs = [...host.querySelectorAll('[data-lpack]')].filter(c => c.checked).map(c => c.dataset.lpack);
      M.count = Math.max(1, parseInt($('#lrCount').value, 10) || 10);
      M.timer = Math.max(5, parseInt($('#lrTimer').value, 10) || 30);
      M.easy = $('#lrEasy').checked; M.custom = $('#lrCustom').value;
      save();
      $('#lrNew').disabled = !categories().length;
    };
    host.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', read));
    $('#lrNew').onclick = () => {
      read();
      if (M.deck && !M.deck.done && M.deck.i > 0 && !confirm('Start a new game? The current scores will be cleared.')) return;
      newDeck(); renderStage();
    };
    if (d) $('#lrResume').onclick = () => { read(); d.done ? renderEnd() : renderStage(); };
    renderPhoneHint();
  }
  function renderPhoneHint() {
    const el = $('#lrPhones');
    if (!el) return;
    const l = live(), n = l ? l.players().length : 0;
    el.innerHTML = n ? `📱 ${n} player${n === 1 ? '' : 's'} on phones: they'll type their answers and get scored automatically.`
      : 'No phones connected, so everyone shouts their answers. To play on phones, start a live game in <b>1 📱 Let players join</b>.';
  }

  // ---------- Playing ----------
  function stop() { clearInterval(timerId); timerId = null; clearTimeout(autoTimer); clearInterval(rollId); rollId = null; }
  function announce() {
    const l = live(), d = M.deck, r = round(), item = d.list[d.i];
    if (!l) return;
    l.update({ mode: 'letters', letters: {
      key: key(), i: d.i, total: d.list.length, letter: r.rolled ? item.letter : null, category: item.category, timer: M.timer,
      revealed: !!r.revealed, results: r.results ? scored(r.results, item.letter).map(({ reject, ...x }) => x) : null,
      board: board().slice(0, 30), done: !!d.done
    } });
  }

  function renderStage() {
    stop();
    const d = M.deck, r = round(), item = d.list[d.i], voting = !!phones();
    const last = d.i === d.list.length - 1;
    host.innerHTML = `<div class="qstage" id="lrStage">
      <div class="qtop">
        <span class="pill warn">🔤 Round ${d.i + 1} / ${d.list.length}</span>
        <span class="qtime" id="lrTime"></span>
        <span class="row"><button class="btn" id="lrFull" title="Fullscreen">⛶</button><button class="btn" id="lrExit">Menu</button></span>
      </div>
      <h2 class="qq">${esc(item.category)}</h2>
      <p class="mlwho">starting with</p>
      <div class="lrletter" id="lrLetter">${r.rolled ? item.letter : '?'}</div>
      ${r.revealed && r.results ? resultsHtml(scored(r.results, item.letter))
        : r.revealed ? '<p class="qsip">⏰ Time\'s up! Anyone who didn\'t get an answer in drinks 🍺</p>'
        : voting ? '<p class="qlive" id="lrCount"></p>' : ''}
      <div class="qnav">
        <button class="btn" id="lrSkip">Skip</button>
        <button class="btn primary" id="lrNext">${!r.revealed ? (voting ? 'Reveal answers' : "Time's up") : last ? 'Finish 🏆' : 'Next round ▶'}</button>
      </div>
    </div>`;
    $('#lrExit').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); renderSetup(); };
    $('#lrFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else host.requestFullscreen && host.requestFullscreen().catch(() => {}); };
    $('#lrSkip').onclick = advance;
    $('#lrNext').onclick = () => (r.revealed ? advance() : reveal());
    host.querySelectorAll('[data-rej]').forEach(c => c.onclick = () => {
      const x = r.results.find(y => y.id === c.dataset.rej);
      if (x && x.answer) { x.reject = !x.reject; save(); renderStage(); }
    });
    if (!r.rolled) roll(); else if (!r.revealed) { startTimer(); updateCount(); }
    announce();
  }
  // Spin through the alphabet before landing on the round's letter, then start the clock.
  function roll() {
    const el = $('#lrLetter'), r = round(), target = M.deck.list[M.deck.i].letter;
    let n = 0;
    rollId = setInterval(() => {
      el.textContent = ALPHABET[Math.floor(Math.random() * 26)];
      if (++n >= 14) {
        clearInterval(rollId); rollId = null;
        el.textContent = target; el.classList.add('pop');
        r.rolled = true; r.startedAt = Date.now(); save();
        announce(); startTimer(); updateCount();
      }
    }, 70);
  }
  function startTimer() {
    const r = round();
    const tick = () => {
      const el = $('#lrTime'); if (!el) return stop();
      const left = Math.max(0, Math.ceil(M.timer - (Date.now() - (r.startedAt || Date.now())) / 1000));
      el.textContent = left > 0 ? `⏱ ${left}s` : "⏰ Time's up!";
      el.classList.toggle('low', left <= 5);
      if (left <= 0) { clearInterval(timerId); timerId = null; autoTimer = setTimeout(reveal, 700); }
    };
    tick(); timerId = setInterval(tick, 250);
  }
  function updateCount() {
    const el = $('#lrCount'), l = live(), r = M.deck && round();
    if (!el || !l || !r || r.revealed || !r.rolled) return;
    const k = key(), ps = l.players(), done = ps.filter(p => p.answers && typeof p.answers[k] === 'string' && p.answers[k].trim()).length;
    el.textContent = `📱 ${done} of ${ps.length} answered`;
    if (ps.length && done >= ps.length) { clearTimeout(autoTimer); autoTimer = setTimeout(reveal, 1200); }
  }
  function reveal() {
    const r = round();
    if (r.revealed || !$('#lrStage')) return;
    stop();
    const l = phones(), k = key();
    r.results = l ? l.players().map(p => ({ id: p.id, name: p.name, answer: String((p.answers && p.answers[k]) || '').trim().slice(0, 40), reject: false })) : null;
    r.revealed = true; save(); renderStage();
  }
  function resultsHtml(rows) {
    const label = { unique: '+10', shared: '+5 · copycat', wrong: 'wrong letter', rejected: 'rejected', blank: 'no answer' };
    const sippers = rows.filter(x => x.pts === 0 || x.status === 'shared').map(x => esc(x.name));
    return `<div class="lrgrid">${rows.sort((a, b) => b.pts - a.pts).map(x => `
        <button class="lrans ${x.status}" data-rej="${esc(x.id)}" ${x.answer ? 'title="Tap to reject or accept this answer"' : 'disabled'}>
          <span class="who">${esc(x.name)}</span><b>${x.answer ? esc(x.answer) : '—'}</b><span class="pts">${label[x.status]}</span></button>`).join('')}</div>
      <p class="hint" style="text-align:center">Tap an answer that doesn't fit the category to reject it.</p>
      ${sippers.length ? `<p class="qsip">🍺 ${sippers.join(', ')} ${sippers.length > 1 ? 'drink' : 'drinks'}!</p>` : '<p class="qsip">🎉 Everyone was unique! Nobody drinks… this time.</p>'}`;
  }
  function advance() {
    const d = M.deck;
    if (d.i >= d.list.length - 1) { d.done = true; save(); renderEnd(); return; }
    d.i++; save(); renderStage();
  }

  function renderEnd() {
    stop();
    const b = board();
    host.innerHTML = `<div class="qstage">
      <div class="qtop"><span class="pill ok">Game over</span><span></span><button class="btn" id="lrExit">Menu</button></div>
      <h2 class="qq">🏆 Final scores</h2>
      ${b.length ? `<ol class="qboard">${b.map((r, i) => `<li class="${i === 0 ? 'win' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(r.name)}</span><b>${r.pts}</b></li>`).join('')}</ol>
        ${b.length > 1 && b[0].pts !== b[b.length - 1].pts ? `<p class="qsip">🍻 ${esc(b[b.length - 1].name)}: last place, finish your drink!</p>` : ''}`
        : '<p class="hint" style="text-align:center">Played without phones, so there are no scores. Hope everyone had fun!</p>'}
      <div class="qnav"><button class="btn" id="lrBack">◀ Back</button><button class="btn primary" id="lrAgain">Play again</button></div>
    </div>`;
    $('#lrExit').onclick = renderSetup;
    $('#lrBack').onclick = () => { M.deck.done = false; save(); renderStage(); };
    $('#lrAgain').onclick = () => { newDeck(); renderStage(); };
    announce();
  }

  window.addEventListener('boozy:players', () => { updateCount(); renderPhoneHint(); });

  // Don't jump straight back into a running round on page load; show the setup screen with Resume.
  renderSetup();
};
