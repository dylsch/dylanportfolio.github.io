// Firebase settings for Freelance Accounts. This is its own Firebase project, separate from
// everything else on this site. See SETUP.md.
//
// These values are safe to publish: access is enforced by the Firestore rules (firestore.rules),
// not by keeping them secret. Your email is only in the rules in the Firebase console, never here.
window.ACCOUNTS_FIREBASE = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_APP_ID'
};
