// Login gate: Google sign-in through the same Firebase project as Party Games. Only the owner's
// account can open the accounts. That is enforced by the Firestore rules (ledger/{uid} is readable
// only by the owner's verified email), so the owner's email never appears in this public code.
import { startApp } from './app.js';
import { firestoreStore } from './store.js';

const FIREBASE = 'https://www.gstatic.com/firebasejs/10.14.1/';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const box = $('#gateBox');
const cfg = window.BOOZY_FIREBASE || {};

const GOOGLE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

if (!cfg.apiKey || cfg.apiKey.startsWith('PASTE')) {
  box.innerHTML = `<h1>🔧 Setup needed</h1><p>The Firebase settings in <code>boozy-bingo/firebase-config.js</code> are missing. See <code>accounts/SETUP.md</code>.</p>`;
} else {
  run().catch(e => {
    box.innerHTML = `<h1>📡 Couldn't reach Google</h1><p>The login service didn't load (${esc(e.message || e)}). Check your internet connection and refresh.</p>`;
  });
}

async function run() {
  const [{ initializeApp }, auth_, fs] = await Promise.all(
    ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(FIREBASE + f)));
  const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } = auth_;
  // A named app instance keeps this page's sign-in separate from anything else on the site.
  const app = initializeApp(cfg, 'accounts');
  const auth = getAuth(app);
  // Memory cache only: nothing from the accounts is left behind in the browser after signing out.
  const db = fs.getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let started = false;
  const gate = html => { $('#app').hidden = true; $('#gate').hidden = false; box.innerHTML = html; };
  const otherAccount = '<button class="btn secondary" data-signout>Use a different account</button>';
  box.addEventListener('click', e => { if (e.target.closest('[data-signout]')) signOut(auth); });

  function showSignIn() {
    gate(`<h1>🇲🇹 Freelance Accounts</h1><p>Private – sign in with your Google account.</p>
      <button class="btn google" id="googleBtn">${GOOGLE_ICON} Sign in with Google</button>`);
    $('#googleBtn').onclick = async () => {
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') signInWithRedirect(auth, provider);
        else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request')
          gate(`<h1>⚠️ Sign-in failed</h1><p>${esc(e.message)}</p>${otherAccount}`);
      }
    };
  }

  let seq = 0;
  onAuthStateChanged(auth, async user => {
    const mine = ++seq;
    // Signing out while the app is open: reload so none of the accounts stay on screen.
    if (started) { location.reload(); return; }
    if (!user || user.isAnonymous) { showSignIn(); return; }
    gate(`<p class="muted">Opening your accounts…</p>`);
    const store = firestoreStore(db, fs, user.uid);
    try {
      await store.ready;
    } catch (e) {
      store.stop();
      if (mine !== seq) return;
      if (e.code === 'permission-denied') {
        gate(`<h1>🔒 Private</h1><p>Signed in as <b>${esc(user.email)}</b>.</p>
          <p>This app belongs to someone else, so this account can't open it.</p>
          <p class="hint">If this is your account: the <code>ledger</code> rules haven't been published in Firebase yet –
            see <code>accounts/SETUP.md</code>.</p>${otherAccount}`);
      } else {
        gate(`<h1>⚠️ Something went wrong</h1><p>${esc(e.message || e)}</p>${otherAccount}`);
      }
      return;
    }
    if (mine !== seq) { store.stop(); return; }
    started = true;
    $('#gate').hidden = true;
    $('#app').hidden = false;
    startApp(store, user, { signOut: () => signOut(auth) });
  });
}
