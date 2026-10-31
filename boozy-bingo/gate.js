// Boozy Bingo access gate: Google sign-in via Firebase Auth, with an approve-list and
// access requests stored in Firestore (enforced by firestore.rules).
// Firebase is only downloaded once the config check passes.
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.14.1/';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const box = $('#gateBox');
const cfg = window.BOOZY_FIREBASE || {};

const GOOGLE_ICON = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

const configured = cfg.apiKey && !cfg.apiKey.startsWith('PASTE');

if (!configured) {
  box.innerHTML = `<div class="big">🔧</div><h2>Setup needed</h2>
    <p class="hint">The login gate isn't configured yet. Fill in <code>firebase-config.js</code>. Step-by-step instructions are in <code>SETUP.md</code>.</p>`;
} else {
  run().catch(e => {
    box.innerHTML = `<div class="big">📡</div><h2>Couldn't reach Google</h2>
      <p class="hint">The login service didn't load (${esc(e.message || e)}). Check your internet connection and refresh.</p>`;
  });
}

async function run() {
  const [{ initializeApp }, {
    getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged
  }, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(FIREBASE + f)));
  const { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp, getDocs, query, limit } = fs;

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let unsubs = [];
  let started = false;
  const stopListening = () => { unsubs.forEach(u => u()); unsubs = []; };

  const signOutBtn = '<button class="btn" data-signout>Use a different account</button>';
  box.addEventListener('click', e => { if (e.target.closest('[data-signout]')) signOut(auth); });

  function gate(html) {
    if (started) return;
    $('#app').hidden = true; $('#gate').hidden = false; box.innerHTML = html; }
  let signedInEmail = '';
  function gateError(err) {
    // With the published rules, everyone may read their own access status, so a permission error
    // here means the Firestore rules from SETUP.md aren't live yet.
    if (err && err.code === 'permission-denied') {
      gate(`<div class="big">🔐</div><h2>Database not set up yet</h2>
        ${signedInEmail ? `<p class="hint">Signed in as <b>${esc(signedInEmail)}</b></p>` : ''}
        <p class="hint">Firestore refused the request, which means the Party Games rules aren't published yet. In the Firebase console go to <b>Firestore Database → Rules</b>, paste the rules, press <b>Publish</b>, wait a minute and refresh.</p>
        <div class="row mt"><button class="btn primary" onclick="location.reload()">Refresh</button>${signOutBtn}</div>`);
      return;
    }
    gate(`<div class="big">⚠️</div><h2>Something went wrong</h2><p class="hint">${esc(err.message || err)}</p><div class="row mt">${signOutBtn}</div>`);
  }

  function showSignIn() {
    gate(`<div class="big">🎉</div><h2>Private party</h2>
      <p class="hint">Party Games is invite-only. Sign in with Google. If you're not on the list yet, you can ask the host for access.</p>
      <div class="row mt"><button class="gbtn" id="googleBtn">${GOOGLE_ICON} Sign in with Google</button></div>`);
    $('#googleBtn').onclick = async () => {
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') signInWithRedirect(auth, provider);
        else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') gateError(e);
      }
    };
  }

  function showRequest(user) {
    const who = `<p class="hint">Signed in as <b>${esc(user.email)}</b></p>`;
    unsubs.push(onSnapshot(doc(db, 'requests', user.uid), snap => {
      const r = snap.exists() ? snap.data() : null;
      if (!r) {
        gate(`<div class="big">🙋</div><h2>Ask for access</h2>${who}
          <p class="hint">You're not on the guest list yet. Send the host a request, and this page opens automatically once they approve it.</p>
          <label for="reqMsg" style="text-align:left">Message (optional)</label>
          <textarea id="reqMsg" maxlength="500" placeholder="Hi, it's me from Friday's party!"></textarea>
          <div class="row mt"><button class="btn primary" id="sendReq">Send request</button>${signOutBtn}</div>`);
        $('#sendReq').onclick = async () => {
          $('#sendReq').disabled = true;
          try {
            await setDoc(doc(db, 'requests', user.uid), {
              email: user.email, name: user.displayName || '', photo: user.photoURL || '',
              message: $('#reqMsg').value.trim().slice(0, 500), status: 'pending', createdAt: serverTimestamp()
            });
          } catch (e) { gateError(e); }
        };
      } else if (r.status === 'denied') {
        gate(`<div class="big">🚫</div><h2>Request declined</h2>${who}
          <p class="hint">The host hasn't given this account access. Contact them directly if you think that's a mistake.</p>
          <div class="row mt">${signOutBtn}</div>`);
      } else {
        gate(`<div class="big">⏳</div><h2>Request sent</h2>${who}
          <p class="hint">Waiting for the host to approve you. Keep this page open, or come back later: it unlocks automatically.</p>
          <div class="row mt">${signOutBtn}</div>`);
      }
    }, gateError));
  }

  function openApp(user, isAdmin) {
    if (started) return;
    started = true;
    $('#gate').hidden = true;
    $('#app').hidden = false;
    $('#userChip').innerHTML = `${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : ''}
      <span>${esc(user.displayName || user.email)}</span><button id="signOutBtn">Sign out</button>`;
    $('#signOutBtn').onclick = () => signOut(auth);
    window.startBoozyApp();
    if (window.startBoozyLive) window.startBoozyLive({ db, fs, user });
    if (window.boozyStats) window.boozyStats.connect({ db, fs, user });
    if (isAdmin) startAdmin();
  }

  function startAdmin() {
    document.body.classList.add('is-admin'); // reveals the 🔒 Access button in the top bar
    let requests = [], allowed = [];
    const avatar = p => p.photo ? `<img src="${esc(p.photo)}" alt="" referrerpolicy="no-referrer">` : '<div class="av"></div>';
    const when = ts => ts && ts.toDate ? ts.toDate().toLocaleString() : '';

    function render() {
      const pending = requests.filter(r => r.status === 'pending');
      const denied = requests.filter(r => r.status === 'denied');
      const badge = $('#reqBadge');
      badge.hidden = !pending.length;
      badge.textContent = pending.length;
      $('#reqList').innerHTML = pending.length ? pending.map(r => `<div class="req">${avatar(r)}
        <div class="who"><b>${esc(r.name || 'No name')}</b><div class="e">${esc(r.email)} · ${esc(when(r.createdAt))}</div>
          ${r.message ? `<div class="msg">${esc(r.message)}</div>` : ''}</div>
        <div class="acts"><button class="btn primary" data-approve="${esc(r.id)}">Approve</button><button class="btn danger" data-deny="${esc(r.id)}">Decline</button></div></div>`).join('')
        : '<p class="hint">No pending requests.</p>';
      $('#allowedList').innerHTML = allowed.length ? allowed.map(a => `<div class="req">${avatar(a)}
        <div class="who"><b>${esc(a.name || 'No name')}</b><div class="e">${esc(a.email)}</div></div>
        <div class="acts"><button class="btn danger" data-revoke="${esc(a.id)}">Remove</button></div></div>`).join('')
        : '<p class="hint">Nobody else yet.</p>';
      $('#deniedList').innerHTML = denied.length ? denied.map(r => `<div class="req">${avatar(r)}
        <div class="who"><b>${esc(r.name || 'No name')}</b><div class="e">${esc(r.email)}</div></div>
        <div class="acts"><button class="btn" data-approve="${esc(r.id)}">Approve</button><button class="btn" data-clear="${esc(r.id)}" title="Let them send a new request">Clear</button></div></div>`).join('')
        : '<p class="hint">None.</p>';
    }

    unsubs.push(onSnapshot(collection(db, 'requests'), snap => {
      const before = requests.filter(r => r.status === 'pending').length;
      requests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      const now = requests.filter(r => r.status === 'pending').length;
      if (now > before && render.done) showToast('🙋 New access request. Check the Access tab.');
      render(); render.done = true;
    }, e => showToast('Access list error: ' + e.message)));
    unsubs.push(onSnapshot(collection(db, 'allowed'), snap => {
      allowed = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    }, e => showToast('Access list error: ' + e.message)));

    $('#tab-access').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const find = id => requests.find(r => r.id === id) || allowed.find(a => a.id === id) || {};
      try {
        if (b.dataset.approve) {
          const r = find(b.dataset.approve);
          await setDoc(doc(db, 'allowed', r.id), { email: r.email || '', name: r.name || '', photo: r.photo || '', approvedAt: serverTimestamp() });
          await setDoc(doc(db, 'requests', r.id), { status: 'approved' }, { merge: true });
          showToast(`✅ ${r.name || r.email} can now play`);
        } else if (b.dataset.deny) {
          await setDoc(doc(db, 'requests', b.dataset.deny), { status: 'denied' }, { merge: true });
        } else if (b.dataset.revoke) {
          const a = find(b.dataset.revoke);
          if (!confirm(`Remove access for ${a.name || a.email}?`)) return;
          await deleteDoc(doc(db, 'allowed', a.id));
          await setDoc(doc(db, 'requests', a.id), { email: a.email || '', name: a.name || '', photo: a.photo || '', status: 'denied' }, { merge: true });
        } else if (b.dataset.clear) {
          await deleteDoc(doc(db, 'requests', b.dataset.clear));
        }
      } catch (err) { showToast('⚠️ ' + err.message); }
    });
  }

  function showToast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.remove('show'), 4000);
  }

  let authSeq = 0;
  onAuthStateChanged(auth, async user => {
    const seq = ++authSeq;
    signedInEmail = user ? user.email || '' : '';
    stopListening();
    // Signing out (or losing access) while the app is open: reload so no app state lingers on screen.
    if (started) { location.reload(); return; }
    if (!user || user.isAnonymous) { showSignIn(); return; }
    // The owner's email lives only in the Firestore rules (not in this public code): only the owner
    // is allowed to list access requests, so a successful read means "this is the owner".
    gate('<p class="hint">Checking the guest list…</p>');
    const isAdmin = await getDocs(query(collection(db, 'requests'), limit(1))).then(() => true, () => false);
    if (seq !== authSeq) return; // signed out or switched account while checking
    if (isAdmin) { openApp(user, true); return; }
    let requestShown = false;
    unsubs.push(onSnapshot(doc(db, 'allowed', user.uid), snap => {
      if (snap.exists()) openApp(user, false);
      else if (started) location.reload();
      else if (!requestShown) { requestShown = true; showRequest(user); }
    }, gateError));
  });
}
