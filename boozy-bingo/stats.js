// Boozy Bingo: game history and statistics. Each finished game is recorded once; records live in the
// host's private Firestore area (stats/{uid}/games) when signed in online, otherwise in this browser.
window.startBoozyStats = () => {
  'use strict';

  const LOCAL = 'boozyBingo.stats';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = $('#tab-stats');
  const GAMES = {
    quiz: { emoji: '🧠', name: 'Quiz Night' }, letters: { emoji: '🔤', name: 'Letter Rush' },
    mlt: { emoji: '🙋', name: "Who's Most Likely To" }, bingo: { emoji: '🎵', name: 'Boozy Bingo' }
  };
  const PERIODS = { all: 'All time', year: 'This year', d30: 'Last 30 days' };
  let cloud = null, period = 'all', cache = null;

  const localAll = () => { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch { return []; } };
  const localSave = list => { try { localStorage.setItem(LOCAL, JSON.stringify(list.slice(-500))); } catch {} };
  const col = () => cloud.fs.collection(cloud.db, 'stats', cloud.user.uid, 'games');
  const ref = id => cloud.fs.doc(cloud.db, 'stats', cloud.user.uid, 'games', id);

  // entry: { id, game, title, rounds, players: [{ name, team?, pts?, win?, uniques?, picks? }], teams?, winner, extras? }
  async function record(entry) {
    const e = JSON.parse(JSON.stringify({ ...entry, date: Date.now() })); // drop undefined values for Firestore
    cache = null;
    if (cloud) { try { await cloud.fs.setDoc(ref(e.id), e); return; } catch (err) { console.warn('Stats: saving locally instead', err); } }
    localSave([...localAll().filter(x => x.id !== e.id), e]);
  }
  async function all() {
    if (cache) return cache;
    let list = localAll();
    if (cloud) {
      try { list = (await cloud.fs.getDocs(col())).docs.map(d => d.data()).concat(list); }
      catch (err) { console.warn('Stats: could not load from the cloud', err); }
    }
    return (cache = list.sort((a, b) => b.date - a.date));
  }
  async function remove(ids) {
    cache = null;
    localSave(localAll().filter(x => !ids.includes(x.id)));
    if (cloud) await Promise.all(ids.map(id => cloud.fs.deleteDoc(ref(id)).catch(() => {})));
  }
  // Once signed in online, move anything recorded on this device into the cloud.
  async function connect(ctx) {
    cloud = ctx; cache = null;
    const pending = localAll();
    if (!pending.length) return;
    try { await Promise.all(pending.map(e => cloud.fs.setDoc(ref(e.id), e))); localSave([]); }
    catch (err) { console.warn('Stats: will retry uploading local history later', err); }
  }

  // ---------- Aggregation ----------
  const nameKey = n => String(n || '').trim().toLowerCase();
  function inPeriod(e) {
    if (period === 'year') return new Date(e.date).getFullYear() === new Date().getFullYear();
    if (period === 'd30') return Date.now() - e.date < 30 * 864e5;
    return true;
  }
  function aggregate(list) {
    const byGame = {}, packs = {}, people = {};
    list.forEach(e => {
      byGame[e.game] = (byGame[e.game] || 0) + 1;
      if (e.game === 'quiz') packs[e.title] = (packs[e.title] || 0) + 1;
      (e.players || []).forEach(p => {
        const k = nameKey(p.name); if (!k) return;
        const s = people[k] = people[k] || { name: p.name, games: 0, wins: 0, quizGames: 0, quizPts: 0, fastest: null, uniques: 0, picks: 0, bingos: 0 };
        s.games++; if (p.win) s.wins++;
        if (e.game === 'quiz') { s.quizGames++; s.quizPts += p.pts || 0; }
        if (e.game === 'letters') s.uniques += p.uniques || 0;
        if (e.game === 'mlt') s.picks += p.picks || 0;
        if (e.game === 'bingo' && p.win) s.bingos++;
      });
      const f = e.extras && e.extras.fastest;
      if (f && f.name && people[nameKey(f.name)]) {
        const s = people[nameKey(f.name)];
        if (s.fastest === null || f.ms < s.fastest) s.fastest = f.ms;
      }
    });
    const table = Object.values(people).sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
    return { byGame, packs: Object.entries(packs).sort((a, b) => b[1] - a[1]), table };
  }

  // ---------- Page ----------
  async function render() {
    host.innerHTML = '<div class="card"><p class="hint">Loading stats…</p></div>';
    const everything = await all(), list = everything.filter(inPeriod), a = aggregate(list);
    const champ = a.table.find(p => p.wins > 0);
    const ranked = Object.entries(a.byGame).sort((x, y) => y[1] - x[1]);
    const top = ranked[0], tied = top ? ranked.filter(r => r[1] === top[1]).length : 0;
    const totalGames = list.length, maxGame = Math.max(1, ...Object.values(a.byGame));
    const tile = (label, value, sub) => `<div class="stile"><span class="sl">${label}</span><b class="sv">${value}</b>${sub ? `<span class="ss">${sub}</span>` : ''}</div>`;

    host.innerHTML = `
      <div class="row stbar">
        <div class="seg" role="group" aria-label="Time period">${Object.entries(PERIODS).map(([id, n]) => `<button class="${id === period ? 'active' : ''}" data-period="${id}">${n}</button>`).join('')}</div>
        <span class="hint">${cloud ? '☁️ Saved to your account, available on any device' : '💻 Saved in this browser'}</span>
      </div>
      ${!totalGames ? `<div class="card"><h2>📊 No games yet${period === 'all' ? '' : ' in this period'}</h2>
        <p class="hint">Finish a quiz, a Letter Rush or a Who's Most Likely To game, or check a winning bingo card, and the results appear here.</p></div>` : `
      <div class="stiles">
        ${tile('Games played', totalGames)}
        ${tile('Most played', !top ? '–' : tied > 1 ? `${top[1]} each` : `${GAMES[top[0]].emoji} ${top[1]}`, !top ? '' : tied > 1 ? `${tied}-way tie` : GAMES[top[0]].name)}
        ${tile('All-time champion', champ ? esc(champ.name) : '–', champ ? `${champ.wins} win${champ.wins === 1 ? '' : 's'}` : 'No winners yet')}
        ${tile('Players', a.table.length, 'different names')}
      </div>
      <div class="grid2 mt">
        <div class="card">
          <h2>Games by type</h2>
          <div class="sbars">${Object.entries(GAMES).map(([id, g]) => {
            const n = a.byGame[id] || 0, pct = totalGames ? Math.round(100 * n / totalGames) : 0;
            return `<div class="sbar" tabindex="0" data-tip="${esc(g.name)}: ${n} game${n === 1 ? '' : 's'} (${pct}% of all)">
              <span class="sbl">${g.emoji} ${esc(g.name)}</span><span class="sbt"><i style="width:${n ? Math.max(2, 100 * n / maxGame) : 0}%"></i></span><b>${n}</b></div>`;
          }).join('')}<div class="stip" id="stTip" hidden></div></div>
        </div>
        <div class="card">
          <h2>Favourite quiz packs</h2>
          ${a.packs.length ? `<ol class="slist">${a.packs.slice(0, 6).map(([t, n]) => `<li><span>${esc(t)}</span><b>${n}×</b></li>`).join('')}</ol>` : '<p class="hint">No quizzes played yet.</p>'}
        </div>
      </div>
      <div class="card mt">
        <h2>Players</h2>
        ${a.table.length ? `<div class="stable"><table>
          <thead><tr><th>Player</th><th>Games</th><th>Wins</th><th>Avg quiz points</th><th>Fastest answer</th><th>Unique answers</th><th>"Most likely" picks</th><th>Bingos</th></tr></thead>
          <tbody>${a.table.map((p, i) => `<tr><td>${i === 0 && p.wins ? '👑 ' : ''}${esc(p.name)}</td><td>${p.games}</td><td>${p.wins}</td>
            <td>${p.quizGames ? Math.round(p.quizPts / p.quizGames) : '–'}</td><td>${p.fastest !== null ? (p.fastest / 1000).toFixed(1) + 's' : '–'}</td>
            <td>${p.uniques || '–'}</td><td>${p.picks || '–'}</td><td>${p.bingos || '–'}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="hint">Player stats come from games played on phones. Paper and shout-out games still count in the totals above.</p>'}
      </div>
      <div class="card mt">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Recent games</h2>
          <button class="btn danger" id="stClear">Clear ${period === 'all' ? 'all history' : 'this period'}</button></div>
        <div class="srecent">${list.slice(0, 40).map(e => `<div class="srow">
          <span class="sd">${new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span>${/^\p{Extended_Pictographic}/u.test(e.title || '') ? '' : ((GAMES[e.game] || {}).emoji || '🎲') + ' '}<b>${esc(e.title || (GAMES[e.game] || {}).name)}</b>${e.rounds ? ` <span class="hint">· ${e.rounds} round${e.rounds === 1 ? '' : 's'}</span>` : ''}</span>
          <span>${e.winner ? `👑 ${esc(e.winner)}` : '<span class="hint">no winner recorded</span>'}</span>
          <span class="hint">${(() => { const n = (e.players || []).length || (e.teams || []).length || 0, w = (e.players || []).length ? 'player' : 'team'; return n ? `${n} ${w}${n === 1 ? '' : 's'}` : ''; })()}</span>
          <button class="lvkick" data-del="${esc(e.id)}" title="Delete this game from the stats" aria-label="Delete">✕</button></div>`).join('')}</div>
      </div>`}`;

    host.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; render(); });
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this game from the stats?')) return;
      await remove([b.dataset.del]); render();
    });
    const clr = $('#stClear');
    if (clr) clr.onclick = async () => {
      if (!confirm(`Delete ${list.length} game${list.length === 1 ? '' : 's'} from the stats? This can't be undone.`)) return;
      await remove(list.map(e => e.id)); render();
    };
    // Hover / focus tooltip for the bars.
    const tip = $('#stTip');
    host.querySelectorAll('.sbar').forEach(r => {
      const show = () => { tip.textContent = r.dataset.tip; tip.hidden = false; tip.style.top = (r.offsetTop + r.offsetHeight + 4) + 'px'; };
      r.addEventListener('mouseenter', show); r.addEventListener('focus', show);
      r.addEventListener('mouseleave', () => { tip.hidden = true; }); r.addEventListener('blur', () => { tip.hidden = true; });
    });
  }

  window.boozyStats = { record, connect, render, all };
};
