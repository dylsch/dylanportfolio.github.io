// Boozy Bingo: Halloween quiz. Host it on a TV/laptop, players answer on printed sheets or out loud.
window.startBoozyQuiz = () => {
  'use strict';

  const KEY = 'boozyBingo.quiz';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Q)); } catch {} };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LETTERS = 'ABCD';

  // [question, correct answer, wrong 1, wrong 2, wrong 3, fun fact]
  const BANK = [
    ['Halloween grew out of which ancient Celtic festival?', 'Samhain', 'Beltane', 'Imbolc', 'Lughnasadh', 'Samhain marked the end of the harvest, when the boundary with the spirit world was said to be thinnest.'],
    ['What is "Halloween" short for?', "All Hallows' Eve", 'Hallowed Evening Feast', 'Hollow Moon Night', "All Hearts' Eve", "It's the evening before All Hallows' (All Saints') Day on 1 November."],
    ['Before pumpkins, what were jack-o\'-lanterns carved from in Ireland and Scotland?', 'Turnips', 'Potatoes', 'Apples', 'Onions', 'Irish immigrants in America switched to pumpkins because they were bigger and easier to carve.'],
    ['Which country is usually credited as the birthplace of Halloween?', 'Ireland', 'USA', 'Mexico', 'Romania', 'The Samhain traditions travelled to America with Irish and Scottish emigrants.'],
    ['What is the fear of Halloween called?', 'Samhainophobia', 'Hallophobia', 'Pumpkinphobia', 'Spectrophobia', 'Spectrophobia is a real word too: it is the fear of mirrors or ghosts.'],
    ['Which famous escape artist died on Halloween in 1926?', 'Harry Houdini', 'David Copperfield', 'Harry Blackstone', 'Howard Thurston', 'Séances to contact Houdini are still held every Halloween.'],
    ['Who wrote "Frankenstein"?', 'Mary Shelley', 'Bram Stoker', 'Edgar Allan Poe', 'Emily Brontë', 'She started it at 18, during a ghost-story contest with Lord Byron.'],
    ['In the novel, who is "Frankenstein"?', 'The scientist', 'The monster', 'The village', "The scientist's dog", 'Victor Frankenstein is the scientist. The creature never gets a name.'],
    ['In which year was Bram Stoker\'s "Dracula" first published?', '1897', '1847', '1921', '1869', 'Stoker never visited Transylvania. He researched it in libraries.'],
    ['Who provides the spooky spoken rap in Michael Jackson\'s "Thriller"?', 'Vincent Price', 'Christopher Lee', 'Boris Karloff', 'Bela Lugosi', 'The full "Thriller" music video runs for almost 14 minutes.'],
    ['What is the name of the masked killer in John Carpenter\'s "Halloween" (1978)?', 'Michael Myers', 'Jason Voorhees', 'Freddy Krueger', 'Norman Bates', 'The film was made on a budget of roughly $300,000.'],
    ['The "Halloween" mask was a cheap, modified mask of which TV character?', 'Captain Kirk', 'Mr. Spock', 'Darth Vader', 'Doctor Who', "The crew bought a William Shatner mask, painted it white and widened the eye holes."],
    ['In "Hocus Pocus", which actress plays Winifred Sanderson?', 'Bette Midler', 'Sarah Jessica Parker', 'Kathy Najimy', 'Meryl Streep', 'Midler has called Winifred her favourite role.'],
    ['In "The Nightmare Before Christmas", Jack Skellington is the Pumpkin King of where?', 'Halloween Town', 'Christmas Town', 'Spooky Hollow', 'Gloom Valley', 'The film took about three years to animate in stop motion.'],
    ['Which country celebrates Día de los Muertos (Day of the Dead)?', 'Mexico', 'Spain', 'Brazil', 'Peru', 'It is a celebration of loved ones, not a "Mexican Halloween". Marigolds guide spirits home.'],
    ['What is a group of crows called?', 'A murder', 'A coven', 'A haunting', 'A shadow', 'Crows can remember human faces for years.'],
    ['What is a group of witches called?', 'A coven', 'A cackle', 'A cauldron', 'A murder', 'Traditionally a coven has 13 members.'],
    ['In "Ghostbusters", what giant monster stomps through New York?', 'The Stay Puft Marshmallow Man', 'Slimer', 'Zuul', 'The Gingerbread Giant', 'Ray thinks of "something that could never destroy us" and picks him.'],
    ['Who sang the 1962 hit "Monster Mash"?', 'Bobby "Boris" Pickett', 'Elvis Presley', 'Chubby Checker', 'Little Richard', 'It went to number one in the US just before Halloween 1962.'],
    ['In folklore, which plant keeps vampires away?', 'Garlic', 'Basil', 'Rosemary', 'Mint', 'Some legends say a vampire must stop and count every grain of rice or seed it finds.'],
    ['Which Stephen King novel features the clown Pennywise?', 'It', 'Carrie', 'The Shining', 'Misery', 'The novel is over 1,100 pages long.'],
    ['When does a werewolf traditionally transform?', 'At the full moon', 'At the new moon', 'At midnight on Fridays', 'During a solar eclipse', 'The silver-bullet weakness was popularised by films like "The Wolf Man" (1941).'],
    ["What is the name of the Addams Family's butler?", 'Lurch', 'Thing', 'Fester', 'Gomez', '"You rang?" Thing is the disembodied hand.'],
    ['In "Harry Potter and the Philosopher\'s Stone", Harry and Ron save Hermione from a troll on which holiday?', 'Halloween', 'Christmas', 'Easter', 'Valentine\'s Day', "Harry's parents also died on Halloween."],
    ['In the UK and Japan, a black cat crossing your path is traditionally…', 'Good luck', 'Bad luck', 'A sign of rain', 'A sign of a wedding', 'In Scotland, a strange black cat turning up at your home is said to bring prosperity.'],
    ['Which medieval tradition, where the poor went door to door praying for the dead, led to trick-or-treating?', 'Souling', 'Mumming', 'Wassailing', 'Carolling', 'In return they were given "soul cakes".'],
    ['Botanically speaking, a pumpkin is a…', 'Fruit', 'Vegetable', 'Root', 'Fungus', 'It\'s a type of berry, from the same family as cucumbers and melons.'],
    ['Which plant\'s root was said to scream and kill anyone who pulled it from the ground?', 'Mandrake', 'Ginseng', 'Wolfsbane', 'Belladonna', 'People once tied a dog to the root to pull it up for them.'],
    ['"Belladonna" is another name for which poisonous plant?', 'Deadly nightshade', 'Foxglove', 'Hemlock', 'Oleander', 'The name means "beautiful lady": Renaissance women used its juice to enlarge their pupils.'],
    ['Which carnivorous plant snaps shut on insects?', 'Venus flytrap', 'Pitcher plant', 'Sundew', 'Corpse flower', 'The trap only closes if a trigger hair is touched twice in about 20 seconds.'],
    ['In "Psycho", what was used as fake blood in the shower scene?', 'Chocolate syrup', 'Tomato ketchup', 'Red wine', 'Beetroot juice', 'The film is black and white, so chocolate syrup looked just right.'],
    ['What is the name of the killer in the "Scream" films?', 'Ghostface', 'Pinhead', 'Leatherface', 'Chucky', "The mask was inspired by Edvard Munch's painting \"The Scream\"."],
    ['Which spirit is the base of a classic "Zombie" cocktail?', 'Rum', 'Vodka', 'Gin', 'Tequila', 'Its creator, Donn Beach, limited customers to two Zombies each.'],
    ['Which spirit goes into a classic Bloody Mary?', 'Vodka', 'Gin', 'Whisky', 'Rum', 'With tequila instead, it becomes a "Bloody Maria".'],
    ['What is a witch\'s traditional twig broom called?', 'A besom', 'A brume', 'A wand', 'A sweeper', 'Besoms are still made from birch twigs today.'],
    ['In which year was "The Exorcist" released?', '1973', '1968', '1980', '1977', 'It was the first horror film nominated for the Best Picture Oscar.'],
    ['Which game involves catching floating apples with only your teeth?', 'Bobbing for apples', 'Apple ducking roulette', 'Snap apple', 'Toffee dunk', 'In Scotland it\'s called "dooking".'],
    ['What is Wednesday Addams\'s brother called?', 'Pugsley', 'Fester', 'Lurch', 'Cousin Itt', 'In the original 1930s cartoons, the family had no names at all.']
  ].map(([q, a, w1, w2, w3, fact]) => ({ q, a, wrong: [w1, w2, w3], fact }));

  const Q = Object.assign({ count: 15, timer: 20, players: 'Team Pumpkin\nTeam Ghoul', custom: '', round: null }, load());

  const host = $('#tab-quiz');
  let timerId = null, timeLeft = 0;

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500);
  }
  const players = () => Q.players.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20);

  function customQuestions() {
    return Q.custom.split('\n').map(l => l.split('|').map(s => s.trim())).filter(p => p.length >= 3 && p[0] && p[1])
      .map(p => ({ q: p[0], a: p[1], wrong: p.slice(2, 5).filter(Boolean), fact: '' }));
  }

  function newRound() {
    const pool = [...customQuestions(), ...shuffle(BANK)];
    const picked = shuffle(pool.slice(0, Math.max(customQuestions().length, Math.min(Q.count, pool.length))));
    Q.round = {
      i: 0, revealed: false, done: false, started: false, players: players(), right: {},
      qs: picked.map(x => { const opts = shuffle([x.a, ...x.wrong]); return { q: x.q, opts, a: opts.indexOf(x.a), fact: x.fact }; })
    };
    save();
  }

  // ---------- Setup screen ----------
  function renderSetup() {
    stopTimer();
    const r = Q.round, total = BANK.length + customQuestions().length;
    host.innerHTML = `<div class="grid2">
      <div class="card">
        <h2>🎃 Halloween quiz</h2>
        <p class="hint">Put this on a TV or laptop everyone can see. Players write their answers on printed sheets, or shout them out. Reveal the answer, give points, and anyone who got it wrong takes a sip.</p>
        <div class="fields">
          <div><label for="qzCount">Questions</label><input type="number" id="qzCount" min="1" max="${total}" value="${Q.count}"></div>
          <div><label for="qzTimer">Timer (seconds, 0 = off)</label><input type="number" id="qzTimer" min="0" max="300" value="${Q.timer}"></div>
        </div>
        <label for="qzPlayers">Players or teams (one per line)</label>
        <textarea class="short" id="qzPlayers" style="min-height:100px">${esc(Q.players)}</textarea>
        <div class="row mt">
          <button class="btn primary" id="qzNew">${r ? 'New quiz' : 'Prepare quiz'}</button>
          ${r ? `<button class="btn spotify" id="qzResume">▶ ${r.started ? (r.done ? 'Show results' : `Resume (question ${r.i + 1}/${r.qs.length})`) : 'Start quiz'}</button>` : ''}
        </div>
        ${r ? `<div class="row mt">
          <button class="btn" id="qzPrintSheets">🖨️ Print answer sheets</button>
          <button class="btn" id="qzPrintKey">🖨️ Print answer key</button>
        </div>
        <p class="hint mt">The printed sheets match this quiz's A–D order. Pressing <b>New quiz</b> reshuffles everything, so print after preparing.</p>` : ''}
      </div>
      <div class="card">
        <h2>Question bank</h2>
        <p class="hint">${BANK.length} built-in Halloween questions covering films, folklore, spooky plants and cocktails, plus any of your own. Each quiz picks a random set.</p>
        <label for="qzCustom">Your own questions (optional, always included)</label>
        <textarea class="short" id="qzCustom" placeholder="Question | Right answer | Wrong 1 | Wrong 2 | Wrong 3&#10;Who is the scariest person here? | The host | Nobody | The DJ | Your ex">${esc(Q.custom)}</textarea>
        <p class="hint">One per line: question, then the right answer, then up to three wrong ones, separated by <code>|</code>.</p>
      </div>
    </div>`;
    const read = () => {
      Q.count = Math.max(1, parseInt($('#qzCount').value, 10) || 15);
      Q.timer = Math.max(0, parseInt($('#qzTimer').value, 10) || 0);
      Q.players = $('#qzPlayers').value; Q.custom = $('#qzCustom').value;
      save();
    };
    host.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', read));
    $('#qzNew').onclick = () => {
      read();
      if (Q.round && Q.round.started && !Q.round.done && !confirm('Throw away the quiz in progress and start a new one?')) return;
      newRound(); renderSetup(); toast(`🎃 ${Q.round.qs.length} questions ready`);
    };
    if (r) {
      $('#qzResume').onclick = () => {
        read();
        if (!r.started) { r.started = true; r.players = players(); save(); }
        r.done ? renderResults() : renderStage();
      };
      $('#qzPrintSheets').onclick = printSheets;
      $('#qzPrintKey').onclick = printKey;
    }
  }

  // ---------- Playing ----------
  function stopTimer() { clearInterval(timerId); timerId = null; }
  function startTimer() {
    stopTimer();
    if (!Q.timer) return;
    timeLeft = Q.timer;
    const tick = () => {
      const el = $('#qzTime'); if (!el) { stopTimer(); return; }
      el.textContent = timeLeft > 0 ? `⏱ ${timeLeft}s` : "⏰ Time's up!";
      el.classList.toggle('low', timeLeft <= 5);
      if (timeLeft <= 0) stopTimer();
      timeLeft--;
    };
    tick(); timerId = setInterval(tick, 1000);
  }

  function renderStage(keepTimer) {
    const r = Q.round, item = r.qs[r.i], right = r.right[r.i] || [];
    host.innerHTML = `<div class="qstage" id="qzStage">
      <div class="qtop">
        <span class="pill warn">Question ${r.i + 1} / ${r.qs.length}</span>
        <span class="qtime" id="qzTime"></span>
        <span class="row">
          <button class="btn" id="qzFull" title="Fullscreen">⛶</button>
          <button class="btn" id="qzExit">Menu</button>
        </span>
      </div>
      <h2 class="qq">${esc(item.q)}</h2>
      <div class="qopts">${item.opts.map((o, k) => `<div class="qopt${r.revealed ? (k === item.a ? ' correct' : ' dim') : ''}"><b>${LETTERS[k]}</b><span>${esc(o)}</span></div>`).join('')}</div>
      ${r.revealed ? `<div class="qreveal">
        ${item.fact ? `<p>💡 ${esc(item.fact)}</p>` : ''}
        <p class="qsip">🍺 Got it wrong? Take a sip!</p>
        ${r.players.length ? `<div class="hint">Who got it right? Tap to give them a point:</div>
          <div class="row qwho">${r.players.map((p, k) => `<button class="btn${right.includes(k) ? ' primary' : ''}" data-right="${k}">${right.includes(k) ? '✓ ' : ''}${esc(p)}</button>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="qnav">
        <button class="btn" id="qzBack" ${r.i === 0 && !r.revealed ? 'disabled' : ''}>◀ Back</button>
        <button class="btn primary" id="qzNext">${!r.revealed ? 'Reveal answer' : r.i === r.qs.length - 1 ? 'Final scores 🏆' : 'Next question ▶'}</button>
      </div>
    </div>`;
    if (!r.revealed && !keepTimer) startTimer(); else if (r.revealed) stopTimer();
    $('#qzExit').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); renderSetup(); };
    $('#qzFull').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else host.requestFullscreen && host.requestFullscreen().catch(() => {});
    };
    $('#qzNext').onclick = next;
    $('#qzBack').onclick = back;
    host.querySelectorAll('[data-right]').forEach(b => b.onclick = () => {
      const k = +b.dataset.right, list = r.right[r.i] = r.right[r.i] || [];
      const at = list.indexOf(k); at >= 0 ? list.splice(at, 1) : list.push(k);
      save(); renderStage(true);
    });
  }
  function next() {
    const r = Q.round;
    if (!r.revealed) r.revealed = true;
    else if (r.i < r.qs.length - 1) { r.i++; r.revealed = false; }
    else { r.done = true; save(); renderResults(); return; }
    save(); renderStage();
  }
  function back() {
    const r = Q.round;
    if (r.revealed) r.revealed = false;
    else if (r.i > 0) { r.i--; r.revealed = true; }
    save(); renderStage();
  }

  function renderResults() {
    stopTimer();
    const r = Q.round;
    const scores = r.players.map((name, k) => ({ name, pts: Object.values(r.right).filter(l => l.includes(k)).length }))
      .sort((a, b) => b.pts - a.pts);
    const top = scores.length ? scores[0].pts : 0;
    const bottom = scores.length ? scores[scores.length - 1].pts : 0;
    host.innerHTML = `<div class="qstage">
      <div class="qtop"><span class="pill ok">Quiz complete</span><span></span><button class="btn" id="qzExit">Menu</button></div>
      <h2 class="qq">🏆 Final scores</h2>
      ${scores.length ? `<ol class="qboard">${scores.map(s => `<li class="${s.pts === top ? 'win' : ''}"><span>${s.pts === top ? '👑 ' : ''}${esc(s.name)}</span><b>${s.pts} / ${r.qs.length}</b></li>`).join('')}</ol>
        ${scores.length > 1 && top !== bottom ? `<p class="qsip">🍻 ${scores.filter(s => s.pts === bottom).map(s => esc(s.name)).join(' & ')}: last place finishes their drink!</p>` : ''}`
        : '<p class="hint">No players were added, so there are no scores. Hope you had fun!</p>'}
      <div class="qnav"><button class="btn" id="qzReview">◀ Back to last question</button><button class="btn primary" id="qzAgain">Play a new quiz</button></div>
    </div>`;
    $('#qzExit').onclick = renderSetup;
    $('#qzReview').onclick = () => { r.done = false; r.revealed = true; save(); renderStage(); };
    $('#qzAgain').onclick = () => { newRound(); Q.round.started = true; save(); renderStage(); };
  }

  // ---------- Printing ----------
  function doPrint(html) {
    $('#printArea').innerHTML = html;
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 50));
  }
  function printSheets() {
    const r = Q.round, names = players();
    const sheet = name => `<div class="qsheet"><h1>🎃 Halloween quiz</h1>
      <p class="qname">Name / team: <span>${esc(name || '')}</span></p>
      <ol>${r.qs.map(() => `<li>${[...LETTERS].map(l => `<i>${l}</i>`).join('')}</li>`).join('')}</ol>
      <p class="qfoot">Circle one letter per question · Wrong answer = sip 🍺 · Please drink responsibly</p></div>`;
    doPrint((names.length ? names : ['']).map(sheet).join(''));
  }
  function printKey() {
    const r = Q.round;
    doPrint(`<div class="qsheet key"><h1>🎃 Halloween quiz: answer key</h1>
      <ol>${r.qs.map(x => `<li><b>${esc(x.q)}</b><br>${LETTERS[x.a]}: ${esc(x.opts[x.a])}</li>`).join('')}</ol></div>`);
  }

  // Keyboard: → or space = reveal/next, ← = back (only while a question is on screen).
  document.addEventListener('keydown', e => {
    if (!$('#qzStage') || !host.classList.contains('active') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });

  if (Q.round && Q.round.started && Q.round.done) renderResults();
  else if (Q.round && Q.round.started) renderStage();
  else renderSetup();
};
