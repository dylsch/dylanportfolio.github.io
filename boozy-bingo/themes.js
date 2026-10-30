// Boozy Bingo: seasonal colour themes with falling decorations, shared by the host page and play.html.
(() => {
  'use strict';

  // Every theme is dark so it reads well on a TV in a dim room. Keys map onto the CSS custom properties.
  const THEMES = [
    { id: 'party', name: 'Party', emoji: '🍹', decor: [],
      c: { bg: '#1d1226', panel: '#2a1b36', 'panel-2': '#352245', line: '#4a3360', text: '#f6eefb', muted: '#bba7c9', accent: '#ffb238', 'accent-ink': '#2a1600', pink: '#ff5d8f' } },
    { id: 'halloween', name: 'Halloween', emoji: '🎃', decor: ['🦇', '🎃', '👻', '🕸️'],
      c: { bg: '#140d0a', panel: '#22150f', 'panel-2': '#2e1c13', line: '#4a2c1b', text: '#fbefe6', muted: '#c9a990', accent: '#ff7a1a', 'accent-ink': '#1f0d00', pink: '#c084fc' } },
    { id: 'christmas', name: 'Christmas', emoji: '🎄', decor: ['❄️', '❄️', '❅', '✨'],
      c: { bg: '#0c1f17', panel: '#12291f', 'panel-2': '#193628', line: '#2a5040', text: '#f3fbf6', muted: '#a9c9b8', accent: '#f2c14e', 'accent-ink': '#241a00', pink: '#ff5a67' } },
    { id: 'newyear', name: 'New Year', emoji: '🎆', decor: ['✨', '🎆', '🎉', '⭐'],
      c: { bg: '#0b0f24', panel: '#141a38', 'panel-2': '#1c2448', line: '#2f3a6b', text: '#f2f4ff', muted: '#a9b1d8', accent: '#ffd34d', 'accent-ink': '#221a00', pink: '#8ab4ff' } },
    { id: 'valentine', name: "Valentine's", emoji: '💘', decor: ['💖', '💕', '❤️', '💗'],
      c: { bg: '#1f0b14', panel: '#2e1220', 'panel-2': '#3b172a', line: '#5c2742', text: '#fff0f5', muted: '#e0a9c0', accent: '#ff5c93', 'accent-ink': '#2a0011', pink: '#ffb3c9' } },
    { id: 'carnival', name: 'Carnival', emoji: '🎭', decor: ['🎭', '🎊', '🎉', '🪅'],
      c: { bg: '#170a2b', panel: '#24113f', 'panel-2': '#2f1752', line: '#4b2a7a', text: '#fbf5ff', muted: '#c3b0e0', accent: '#22d3c5', 'accent-ink': '#00201d', pink: '#ff4fbd' } },
    { id: 'easter', name: 'Easter', emoji: '🐣', decor: ['🐣', '🌷', '🥚', '🐰'],
      c: { bg: '#1d1a2e', panel: '#2a2542', 'panel-2': '#352f52', line: '#4d4673', text: '#fffaf0', muted: '#c8c0e0', accent: '#ffe066', 'accent-ink': '#2a2200', pink: '#ff9ecf' } },
    { id: 'spring', name: 'Spring', emoji: '🌸', decor: ['🌸', '🌼', '🦋', '🌸'],
      c: { bg: '#10201a', panel: '#183027', 'panel-2': '#1f3b30', line: '#335c4b', text: '#f4fff9', muted: '#aed3c1', accent: '#ffa6c9', 'accent-ink': '#2b0016', pink: '#c6f68d' } },
    { id: 'summer', name: 'Summer', emoji: '☀️', decor: ['☀️', '🌴', '🍉', '🐚'],
      c: { bg: '#062433', panel: '#0b3346', 'panel-2': '#104157', line: '#1d5f7c', text: '#effbff', muted: '#a2cfe0', accent: '#ffcc33', 'accent-ink': '#261c00', pink: '#ff8a66' } },
    { id: 'autumn', name: 'Autumn', emoji: '🍂', decor: ['🍂', '🍁', '🍂', '🌰'],
      c: { bg: '#1f130b', panel: '#2c1b10', 'panel-2': '#382315', line: '#5a3a22', text: '#fff4ea', muted: '#d5b597', accent: '#ffa340', 'accent-ink': '#261300', pink: '#ef6b5f' } },
    { id: 'festa', name: 'Malta Festa', emoji: '🇲🇹', decor: ['🎆', '🎇', '✨', '🎆'],
      c: { bg: '#1a0a0c', panel: '#2a1014', 'panel-2': '#36151a', line: '#5a232b', text: '#fff5f5', muted: '#e0b0b5', accent: '#f4f4f4', 'accent-ink': '#a3121d', pink: '#ff5a5a' } }
  ];
  const byId = id => THEMES.find(t => t.id === id);

  // Western (Gregorian) Easter Sunday, used for Carnival and Easter dates.
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  // Pick a theme from the calendar.
  function forDate(now = new Date()) {
    const md = (now.getMonth() + 1) * 100 + now.getDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fromEaster = Math.round((today - easter(now.getFullYear())) / 864e5);
    if (md >= 1228 || md <= 102) return 'newyear';
    if (md >= 1201 || md <= 106) return 'christmas';
    if (fromEaster >= -52 && fromEaster <= -47) return 'carnival'; // the days before Ash Wednesday
    if (md >= 207 && md <= 214) return 'valentine';
    if (fromEaster >= -7 && fromEaster <= 1) return 'easter';
    if (md >= 1001 && md <= 1101) return 'halloween';
    if (md >= 621 && md <= 922) return 'summer';
    if (md >= 320 && md <= 620) return 'spring';
    if (md >= 923 && md <= 1130) return 'autumn';
    return 'party';
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensureStyle() {
    if (document.getElementById('decorStyle')) return;
    const st = document.createElement('style');
    st.id = 'decorStyle';
    st.textContent = `
      #decor { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
      #decor span { position: absolute; top: -12vh; animation: decorFall linear infinite; opacity: .55; will-change: transform; }
      @keyframes decorFall { from { transform: translate3d(0, 0, 0) rotate(0deg); } to { transform: translate3d(var(--drift), 125vh, 0) rotate(var(--spin)); } }
      @media print { #decor { display: none; } }`;
    document.head.appendChild(st);
  }
  function decorate(theme, on) {
    let layer = document.getElementById('decor');
    if (!on || !theme.decor.length || reduceMotion()) { if (layer) layer.remove(); return; }
    ensureStyle();
    if (!layer) { layer = document.createElement('div'); layer.id = 'decor'; layer.setAttribute('aria-hidden', 'true'); document.body.prepend(layer); }
    const n = window.innerWidth < 600 ? 10 : 18;
    layer.innerHTML = Array.from({ length: n }, (_, i) => {
      const dur = 12 + Math.random() * 14;
      return `<span style="left:${Math.random() * 100}%;font-size:${14 + Math.random() * 18}px;animation-duration:${dur}s;animation-delay:${-Math.random() * dur}s;--drift:${Math.round(Math.random() * 120 - 60)}px;--spin:${Math.round(Math.random() * 360 - 180)}deg">${theme.decor[i % theme.decor.length]}</span>`;
    }).join('');
  }

  let applied = null;
  function apply(id, decorOn = true) {
    const t = byId(id) || byId('party');
    const root = document.documentElement.style;
    Object.entries(t.c).forEach(([k, v]) => root.setProperty('--' + k, v));
    document.documentElement.dataset.season = t.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.c.bg;
    if (applied !== t.id + decorOn) decorate(t, decorOn);
    applied = t.id + decorOn;
    return t.id;
  }

  // The host's choice: 'auto' or a theme id, plus whether decorations are shown.
  const choice = () => store.get('boozyBingo.theme', 'auto');
  const decorOn = () => store.get('boozyBingo.decor', true);
  const current = () => (choice() === 'auto' ? forDate() : choice());

  window.BoozyThemes = {
    list: THEMES, byId, forDate, choice, decorOn, current, apply,
    set(id) { store.set('boozyBingo.theme', id); return apply(current(), decorOn()); },
    setDecor(on) { store.set('boozyBingo.decor', !!on); return apply(current(), !!on); }
  };
})();
