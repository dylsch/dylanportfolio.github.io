// Boozy Bingo: themed quizzes (Halloween, Christmas). Host on a TV/laptop; players answer on phones, paper or out loud.
window.startBoozyQuiz = () => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(T.key)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(T.key, JSON.stringify(Q)); } catch {} };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LETTERS = 'ABCD';

  // [question, correct answer, wrong 1, wrong 2, wrong 3, fun fact]
  const toQ = ([q, a, w1, w2, w3, fact]) => ({ q, a, wrong: [w1, w2, w3], fact });

  // [question, correct answer, wrong 1, wrong 2, wrong 3, fun fact]
  const HALLOWEEN = [
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
  ].map(toQ);

  const CHRISTMAS = [
    ['In which country did the tradition of decorating a Christmas tree begin?', 'Germany', 'England', 'Norway', 'USA', 'Queen Victoria\'s German husband, Prince Albert, made it fashionable in Britain in the 1840s.'],
    ['What is German "Glühwein"?', 'Mulled wine', 'Gingerbread', 'Spiced beer', 'Eggnog', 'It\'s the classic drink of German Christmas markets, often served in a souvenir mug.'],
    ['How many reindeer pull Santa\'s sleigh in the poem "A Visit from St. Nicholas", before Rudolph joined?', '8', '6', '9', '12', 'Rudolph was created in 1939 for a department-store colouring book.'],
    ['What is the name of the Grinch\'s dog?', 'Max', 'Rex', 'Buddy', 'Cindy-Lou', 'In the book, the Grinch ties a single antler to Max\'s head.'],
    ['In "Home Alone", where is the McCallister family flying to when they leave Kevin behind?', 'Paris', 'London', 'Rome', 'Miami', 'In "Home Alone 2", Kevin ends up alone in New York instead.'],
    ['In "Elf", which of these is one of the four main elf food groups?', 'Syrup', 'Gingerbread', 'Hot chocolate', 'Marshmallows', 'The four groups: candy, candy canes, candy corns and syrup.'],
    ['Who sang "All I Want for Christmas Is You" (1994)?', 'Mariah Carey', 'Whitney Houston', 'Céline Dion', 'Kylie Minogue', 'It returns to the charts almost every December.'],
    ['Which band released "Last Christmas" in 1984?', 'Wham!', 'Duran Duran', 'Spandau Ballet', 'Culture Club', 'It sat at number 2 in the UK behind Band Aid\'s "Do They Know It\'s Christmas?".'],
    ['Which country sends London a giant Christmas tree for Trafalgar Square every year?', 'Norway', 'Sweden', 'Finland', 'Canada', 'Oslo has sent one every year since 1947 as thanks for Britain\'s support in World War II.'],
    ['What was traditionally hidden in a Christmas pudding for luck?', 'A silver coin', 'A ring', 'An almond', 'A bean', 'Everyone in the family was meant to stir the pudding and make a wish.'],
    ['In "Die Hard", what is the name of the skyscraper?', 'Nakatomi Plaza', 'Gennero Tower', 'McClane Center', 'Takagi Building', 'Is "Die Hard" a Christmas film? That debate counts as a party game too.'],
    ['What is Scrooge\'s first name in "A Christmas Carol"?', 'Ebenezer', 'Jacob', 'Bob', 'Edmund', 'Dickens wrote the story in about six weeks in 1843.'],
    ['Counting Jacob Marley, how many ghosts visit Scrooge?', '4', '3', '5', '2', 'Marley comes first, then the Ghosts of Christmas Past, Present and Yet to Come.'],
    ['In "The Twelve Days of Christmas", what is given on the fifth day?', 'Five gold rings', 'Five calling birds', 'Five geese a-laying', 'Five French hens', 'Add up every gift in the song and you get 364: one for each day of the year, almost.'],
    ['Under which plant are people supposed to kiss at Christmas?', 'Mistletoe', 'Holly', 'Ivy', 'Poinsettia', 'Mistletoe is a semi-parasite: it grows on trees and steals some of their water and nutrients.'],
    ['The poinsettia, the Christmas pot plant, is native to which country?', 'Mexico', 'Brazil', 'Spain', 'India', 'Its red "petals" are actually leaves called bracts. The real flowers are the tiny yellow buds in the middle.'],
    ['Which saint is Santa Claus based on?', 'Saint Nicholas', 'Saint George', 'Saint Christopher', 'Saint Paul', 'Nicholas was a 4th-century bishop of Myra, in what is now Turkey.'],
    ['In which country is Santa called "Père Noël"?', 'France', 'Italy', 'Spain', 'Portugal', 'In Italy he\'s Babbo Natale, and in Malta he\'s Missier il-Milied.'],
    ['Which hot chestnut-and-cocoa drink is a Maltese Christmas tradition?', 'Imbuljuta', 'Kannoli', 'Qagħaq tal-għasel', 'Kinnie', 'It\'s traditionally served after midnight Mass on Christmas Eve.'],
    ['In Malta, what is a "presepju"?', 'A nativity crib', 'A Christmas tree', 'A carol service', 'A Christmas cake', 'Some Maltese villages build huge cribs with moving figures and running water.'],
    ['What is "ġulbiena", grown in Maltese homes before Christmas?', 'Pale sprouted grain used to decorate the crib', 'A red winter flower', 'A honey-filled pastry', 'A type of fir tree', 'The seeds are grown in the dark so the shoots stay white and thread-like.'],
    ['Which real Christmas tree is famous for holding on to its needles?', 'Nordmann fir', 'Norway spruce', 'Scots pine', 'Blue spruce', 'The Norway spruce is the traditional tree, but it drops needles quickly in a warm room.'],
    ['Which holly plants produce the red berries?', 'Female plants', 'Male plants', 'Plants over 10 years old', 'Plants grown in shade', 'Holly berries are toxic to people and pets, so keep them out of reach.'],
    ['In "Love Actually", which song does Billy Mack turn into a Christmas single?', '"Love Is All Around"', '"Wonderful Christmastime"', '"White Christmas"', '"Jingle Bell Rock"', 'His version is called "Christmas Is All Around".'],
    ['In "It\'s a Wonderful Life", what is the name of the angel trying to earn his wings?', 'Clarence', 'Gabriel', 'George', 'Harry', '"Every time a bell rings, an angel gets his wings."'],
    ['Who sings "Fairytale of New York" with The Pogues?', 'Kirsty MacColl', 'Sinéad O\'Connor', 'Dolores O\'Riordan', 'Kate Bush', 'It was released in 1987 and still gets played every Christmas.'],
    ['Which ballet is traditionally performed at Christmas?', 'The Nutcracker', 'Swan Lake', 'Giselle', 'Coppélia', 'Tchaikovsky wrote the music, and it premiered in St Petersburg in 1892.'],
    ['On which date is Boxing Day?', '26 December', '24 December', '27 December', '1 January', 'It\'s traditionally when servants and tradespeople received gift "boxes".'],
    ['Which spirit is the classic base of a Hot Toddy?', 'Whisky', 'Vodka', 'Gin', 'Tequila', 'Mixed with hot water, honey and lemon, it\'s many people\'s favourite "cold remedy".'],
    ['Baileys Irish Cream is made from Irish whiskey and…', 'Cream', 'Coffee', 'Chocolate liqueur', 'Condensed milk', 'Baileys was launched in 1974.'],
    ['What brings Frosty the Snowman to life?', 'An old silk hat', 'A carrot nose', 'A magic scarf', 'A kiss', '"There must have been some magic in that old silk hat they found."'],
    ['In "The Polar Express", what first gift of Christmas does the boy choose?', 'A sleigh bell', 'A snow globe', 'A golden ticket', 'A toy train', 'Only those who truly believe can hear the bell ring.'],
    ['Christmas Island in the Indian Ocean belongs to which country?', 'Australia', 'UK', 'Indonesia', 'New Zealand', 'It\'s famous for the migration of millions of red crabs.'],
    ['Christmas crackers were invented in which country?', 'UK', 'USA', 'France', 'Germany', 'London sweet-maker Tom Smith came up with them in the 1840s.'],
    ['Which fairy tale made gingerbread houses popular?', 'Hansel and Gretel', 'Little Red Riding Hood', 'Snow White', 'The Gingerbread Man', 'The Brothers Grimm published it in Germany in 1812.'],
    ['In Icelandic tradition, how many Yule Lads visit children before Christmas?', '13', '7', '10', '24', 'One of them, Spoon-Licker, steals spoons to lick.'],
    ['Which Finnish town calls itself the official hometown of Santa Claus?', 'Rovaniemi', 'Helsinki', 'Turku', 'Oulu', 'It sits right on the Arctic Circle in Lapland.'],
    ['"Silent Night" was originally written in which language?', 'German', 'English', 'Latin', 'French', '"Stille Nacht" was first performed in Austria in 1818.'],
    ['Which actor plays Santa in "The Santa Clause" (1994)?', 'Tim Allen', 'Steve Martin', 'Robin Williams', 'Billy Crystal', 'His character becomes Santa after accidentally causing the old one to fall off his roof.']
  ].map(toQ);

  const THEMES = {
    halloween: { key: 'boozyBingo.quiz', name: 'Halloween', title: '🎃 Halloween quiz', emoji: '🎃', teams: 'Team Pumpkin\nTeam Ghoul', ink: '#d35400',
      blurb: 'films, folklore, spooky plants and cocktails', bank: HALLOWEEN },
    christmas: { key: 'boozyBingo.quiz.christmas', name: 'Christmas', title: '🎄 Christmas quiz', emoji: '🎄', teams: 'Team Rudolph\nTeam Elf', ink: '#c0392b',
      blurb: 'films, songs, Maltese traditions, festive plants and drinks', bank: CHRISTMAS }
  };
  // Extra packs live in quiz-packs.js.
  Object.entries(window.BOOZY_QUIZ_PACKS || {}).forEach(([id, p]) => {
    THEMES[id] = { key: 'boozyBingo.quiz.' + id, name: p.name, title: `${p.emoji} ${p.name} quiz`, emoji: p.emoji, teams: p.teams, ink: p.ink, blurb: p.blurb, bank: p.qs.map(toQ) };
  });
  THEMES.mixed = { key: 'boozyBingo.quiz.mixed', name: 'Mixed bag', title: '🎲 Mixed bag quiz', emoji: '🎲', teams: 'Team Brains\nTeam Lucky', ink: '#6a1b9a',
    blurb: 'a random mix from every pack', bank: Object.values(THEMES).flatMap(t => t.bank) };
  const PACK_KEY = 'boozyBingo.quizPack';
  let T = THEMES[(() => { try { return localStorage.getItem(PACK_KEY); } catch { return null; } })()] || THEMES.halloween;
  const BANK = () => T.bank;

  const fresh = () => Object.assign({ count: 15, timer: 20, autoReveal: true, every: 5, players: T.teams, custom: '', round: null }, load());
  let Q = fresh();

  const host = $('#tab-quiz');
  // Phone players (live.js) take over team scoring when anyone has joined by QR code.
  const phones = () => !!(window.boozyLive && window.boozyLive.playerCount());
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
    const pool = [...customQuestions(), ...shuffle(BANK())];
    const picked = shuffle(pool.slice(0, Math.max(customQuestions().length, Math.min(Q.count, pool.length))));
    Q.round = {
      id: Date.now().toString(36), i: 0, revealed: false, done: false, started: false, players: players(), right: {},
      qs: picked.map(x => { const opts = shuffle([x.a, ...x.wrong]); return { q: x.q, opts, a: opts.indexOf(x.a), fact: x.fact }; })
    };
    save();
  }

  // ---------- Setup screen ----------
  function renderSetup() {
    stopTimer();
    const r = Q.round, total = BANK().length + customQuestions().length;
    host.innerHTML = `<div class="card packcard">
      <h2>Choose a quiz pack</h2>
      <div class="packs">${Object.entries(THEMES).map(([id, t]) => `<button class="pack${t === T ? ' active' : ''}" data-pack="${id}">
        <span class="pe">${t.emoji}</span><b>${esc(t.name)}</b><small>${t.bank.length} questions</small></button>`).join('')}</div>
    </div>
    <div class="grid2 mt">
      <div class="card">
        <h2>${T.title}</h2>
        <p class="hint">Put this on a TV or laptop everyone can see. Players answer on their phones, write on printed sheets, or shout their answers out. Reveal the answer and give points.</p>
        <div class="fields">
          <div><label for="qzCount">Questions</label><input type="number" id="qzCount" min="1" max="${total}" value="${Q.count}"></div>
          <div><label for="qzTimer">Timer (seconds, 0 = off)</label><input type="number" id="qzTimer" min="0" max="300" value="${Q.timer}"></div>
          <div><label for="qzEvery">Leaderboard every … questions (0 = off)</label><input type="number" id="qzEvery" min="0" max="50" value="${Q.every}"></div>
        </div>
        <label class="check"><input type="checkbox" id="qzAuto" ${Q.autoReveal ? 'checked' : ''}> Auto-reveal the answer when time runs out or every phone has answered</label>
        <label for="qzPlayers">Teams (one per line)</label>
        <textarea class="short" id="qzPlayers" style="min-height:100px">${esc(Q.players)}</textarea>
        <p class="hint">Players on phones are put into these teams in the panel below. Without phones, use them for paper or shout-out teams.</p>
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
        <p class="hint">${BANK().length} built-in questions covering ${T.blurb}, plus any of your own. Each quiz picks a random set.</p>
        <label for="qzCustom">Your own questions (optional, always included)</label>
        <textarea class="short" id="qzCustom" placeholder="Question | Right answer | Wrong 1 | Wrong 2 | Wrong 3&#10;Who is the scariest person here? | The host | Nobody | The DJ | Your ex">${esc(Q.custom)}</textarea>
        <p class="hint">One per line: question, then the right answer, then up to three wrong ones, separated by <code>|</code>.</p>
      </div>
    </div>
    <div id="qzTeams" class="mt"></div>`;
    const read = () => {
      Q.count = Math.max(1, parseInt($('#qzCount').value, 10) || 15);
      Q.timer = Math.max(0, parseInt($('#qzTimer').value, 10) || 0);
      Q.players = $('#qzPlayers').value; Q.custom = $('#qzCustom').value;
      Q.autoReveal = $('#qzAuto').checked;
      Q.every = Math.max(0, parseInt($('#qzEvery').value, 10) || 0);
      save();
      window.dispatchEvent(new Event('boozy:quiz-setup'));
    };
    host.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', read));
    host.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => { read(); setTheme(b.dataset.pack, true); });
    $('#qzNew').onclick = () => {
      read();
      if (Q.round && Q.round.started && !Q.round.done && !confirm('Throw away the quiz in progress and start a new one?')) return;
      newRound(); renderSetup(); toast(`${T.emoji} ${Q.round.qs.length} questions ready`);
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
    window.dispatchEvent(new Event('boozy:quiz-setup'));
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
      if (timeLeft <= 0) { stopTimer(); if (Q.autoReveal && !Q.round.revealed) setTimeout(autoReveal, 600); }
      timeLeft--;
    };
    tick(); timerId = setInterval(tick, 1000);
  }

  function renderStage(keepTimer) {
    const r = Q.round, item = r.qs[r.i], right = r.right[r.i] || [];
    host.innerHTML = `<div class="qstage" id="qzStage">
      <div class="qtop">
        <span class="pill warn">${T.emoji} Question ${r.i + 1} / ${r.qs.length}</span>
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
        ${phones() ? '<div id="qzLiveScores"></div>' : r.players.length ? `<div class="hint">Who got it right? Tap to give them a point:</div>
          <div class="row qwho">${r.players.map((p, k) => `<button class="btn${right.includes(k) ? ' primary' : ''}" data-right="${k}">${right.includes(k) ? '✓ ' : ''}${esc(p)}</button>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="qlive" id="qzLive"></div>
      <div class="qnav">
        <button class="btn" id="qzBack" ${r.i === 0 && !r.revealed ? 'disabled' : ''}>◀ Back</button>
        <button class="btn primary" id="qzNext">${!r.revealed ? 'Reveal answer' : r.i === r.qs.length - 1 ? 'Final scores 🏆' : 'Next question ▶'}</button>
      </div>
    </div>`;
    if (!r.revealed && !keepTimer) startTimer(); else if (r.revealed) stopTimer();
    if (!keepTimer) announce();
    window.dispatchEvent(new Event('boozy:quiz-rendered'));
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
  // live.js mirrors the current question to players' phones (the answer only once it's revealed).
  function announce(done) {
    const r = Q.round, item = r.qs[r.i];
    if (!r.id) { r.id = Date.now().toString(36); save(); }
    window.dispatchEvent(new CustomEvent('boozy:quiz', { detail: {
      round: r.id, i: r.i, total: r.qs.length, q: item.q, opts: item.opts, revealed: r.revealed, answer: item.a, done: !!done, standings: !!r.standings,
      timer: Q.timer
    } }));
  }
  // Reveal on its own when the timer ends or live.js reports every phone has answered.
  function autoReveal() {
    const r = Q.round;
    if (!r || r.revealed || r.done || !$('#qzStage') || !Q.autoReveal) return;
    next();
  }
  window.addEventListener('boozy:all-answered', e => {
    const r = Q.round;
    if (r && e.detail === `${r.id}_${r.i}`) setTimeout(autoReveal, 1200);
  });

  // A leaderboard break after every Q.every questions, when there's anyone scoring.
  const standingsDue = r => Q.every > 0 && (r.i + 1) % Q.every === 0 && r.i < r.qs.length - 1 && (phones() || r.players.length);
  function next() {
    const r = Q.round;
    if (!r.revealed) r.revealed = true;
    else if (!r.standings && standingsDue(r)) { r.standings = true; save(); renderStandings(); return; }
    else if (r.i < r.qs.length - 1) { r.i++; r.revealed = false; r.standings = false; }
    else { r.done = true; save(); renderResults(); return; }
    save(); renderStage();
  }
  function back() {
    const r = Q.round;
    if (r.standings) r.standings = false;
    else if (r.revealed) r.revealed = false;
    else if (r.i > 0) { r.i--; r.revealed = true; }
    save(); renderStage();
  }

  function renderResults() {
    stopTimer();
    const r = Q.round;
    announce(true);
    const scores = manualScores(r);
    const top = scores.length ? scores[0].pts : 0;
    const bottom = scores.length ? scores[scores.length - 1].pts : 0;
    host.innerHTML = `<div class="qstage">
      <div class="qtop"><span class="pill ok">Quiz complete</span><span></span><button class="btn" id="qzExit">Menu</button></div>
      <h2 class="qq">🏆 Final scores</h2>
      ${phones() ? '<div id="qzLiveBoard"></div>' : scores.length ? `<ol class="qboard">${scores.map(s => `<li class="${s.pts === top ? 'win' : ''}"><span>${s.pts === top ? '👑 ' : ''}${esc(s.name)}</span><b>${s.pts} / ${r.qs.length}</b></li>`).join('')}</ol>
`
        : '<p class="hint">No players were added, so there are no scores. Hope you had fun!</p>'}
      <div class="qnav"><button class="btn" id="qzReview">◀ Back to last question</button><button class="btn primary" id="qzAgain">Play a new quiz</button></div>
    </div>`;
    window.dispatchEvent(new Event('boozy:quiz-rendered'));
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
    const sheet = name => `<div class="qsheet" style="--ink:${T.ink}"><h1>${T.title}</h1>
      <p class="qname">Name / team: <span>${esc(name || '')}</span></p>
      <ol>${r.qs.map(() => `<li>${[...LETTERS].map(l => `<i>${l}</i>`).join('')}</li>`).join('')}</ol>
      <p class="qfoot">Circle one letter per question · Good luck!</p></div>`;
    doPrint((names.length ? names : ['']).map(sheet).join(''));
  }
  function printKey() {
    const r = Q.round;
    doPrint(`<div class="qsheet key" style="--ink:${T.ink}"><h1>${T.title}: answer key</h1>
      <ol>${r.qs.map(x => `<li><b>${esc(x.q)}</b><br>${LETTERS[x.a]}: ${esc(x.opts[x.a])}</li>`).join('')}</ol></div>`);
  }

  // Keyboard: → or space = reveal/next, ← = back (only while a question is on screen).
  document.addEventListener('keydown', e => {
    if (!$('#qzStage') || !host.classList.contains('active') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });

  function manualScores(r) {
    return r.players.map((name, k) => ({ name, pts: Object.values(r.right).filter(l => l.includes(k)).length })).sort((a, b) => b.pts - a.pts);
  }
  function renderStandings() {
    stopTimer();
    const r = Q.round, scores = manualScores(r);
    host.innerHTML = `<div class="qstage" id="qzStage">
      <div class="qtop"><span class="pill warn">${T.emoji} After question ${r.i + 1} / ${r.qs.length}</span><span></span>
        <span class="row"><button class="btn" id="qzFull" title="Fullscreen">⛶</button><button class="btn" id="qzExit">Menu</button></span></div>
      <h2 class="qq">📊 Leaderboard</h2>
      ${phones() ? '<div id="qzLiveBoard"></div>' : `<ol class="qboard">${scores.map((s, i) => `<li class="${i === 0 ? 'win' : ''}"><span>${i === 0 ? '👑 ' : ''}${esc(s.name)}</span><b>${s.pts}</b></li>`).join('')}</ol>
`}
      <div class="qnav"><button class="btn" id="qzBack">◀ Back</button><button class="btn primary" id="qzNext">Next question ▶</button></div>
    </div>`;
    $('#qzExit').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); renderSetup(); };
    $('#qzFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else host.requestFullscreen && host.requestFullscreen().catch(() => {}); };
    $('#qzNext').onclick = next; $('#qzBack').onclick = back;
    announce();
    window.dispatchEvent(new Event('boozy:quiz-rendered'));
  }
  function show() {
    if (Q.round && Q.round.started && Q.round.done) renderResults();
    else if (Q.round && Q.round.started && Q.round.standings) renderStandings();
    else if (Q.round && Q.round.started) renderStage();
    else renderSetup();
  }
  // Switch between quiz themes; each keeps its own settings, teams and progress.
  function setTheme(name, toSetup) {
    if (!THEMES[name] || THEMES[name] === T) return;
    if (document.fullscreenElement) document.exitFullscreen();
    stopTimer();
    T = THEMES[name]; Q = fresh();
    try { localStorage.setItem(PACK_KEY, name); } catch {}
    toSetup ? renderSetup() : show();
  }
  window.boozyQuiz = { teams: players, setTheme };
  show();
};
