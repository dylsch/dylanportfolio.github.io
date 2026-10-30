// Firebase settings for the Boozy Bingo login gate. See SETUP.md.

// false = no login: anyone who opens the page can use it (handy for running locally).
// Set to true once the Firebase steps in SETUP.md are done.
window.BOOZY_LOGIN_ENABLED = false;

// These values are safe to publish: access is enforced by the Firestore rules, not by keeping them secret.
window.BOOZY_FIREBASE = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_APP_ID'
};

// The Google account that owns the app and approves access requests.
// Must match the email in firestore.rules.
window.BOOZY_ADMIN_EMAIL = 'YOUR_EMAIL@gmail.com';
