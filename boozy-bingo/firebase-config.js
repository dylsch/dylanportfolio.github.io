// Firebase settings for the Boozy Bingo login gate. See SETUP.md.

// true = the online page requires Google login (until Firebase is set up it shows "Setup needed",
// so nobody can use it). Running on your own computer always skips the login.
window.BOOZY_LOGIN_ENABLED = true;

// These values are safe to publish: access is enforced by the Firestore rules, not by keeping them secret.
// Who the owner is lives only in the Firestore rules in the Firebase console, never in this public file.
window.BOOZY_FIREBASE = {
  apiKey: 'AIzaSyA8XuZZIpLP11wZb86HfBYdJ3nyArCanB0',
  authDomain: 'boozy-bingo-5f57b.firebaseapp.com',
  projectId: 'boozy-bingo-5f57b',
  appId: '1:234611791736:web:45007f7dc3b52d8a8a5a8d'
};
