# Accounts: setup

The accounts page (`/accounts/`) has **its own Firebase project**. It shares nothing with anything else on this site:
it has its own config (`firebase-config.js`), its own rules (`firestore.rules`), its own sign-in and its own database.
Only your own Google account can open it. Everything here runs on Firebase's free plan, so no credit card is needed.

Until step 1 is done, the page shows **🔧 Setup needed**.

## 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> and click **Create a project**, e.g. `freelance-accounts`. You can turn Google Analytics off.
2. On the project home page, click the **Web** icon (`</>`) to add a web app. Give it a nickname and skip Hosting.
3. Firebase shows a `firebaseConfig` block. Copy `apiKey`, `authDomain`, `projectId` and `appId` into
   `accounts/firebase-config.js`, replacing the `PASTE_…` placeholders. Your email does **not** go in this file.

## 2. Turn on Google sign-in
1. Go to **Build → Authentication → Get started → Sign-in method → Google**, click **Enable**, and save.
2. Go to **Authentication → Settings → Authorized domains → Add domain**, and add `dylsch.github.io`.

## 3. Create the database and lock it down
1. Go to **Build → Firestore Database → Create database**. Pick a European location (e.g. `eur3` or `europe-west1`)
   and start in **production mode**.
2. Open the **Rules** tab and replace everything with the contents of `accounts/firestore.rules`.
3. Change `YOUR_EMAIL@gmail.com` to your Gmail address, then click **Publish**.

## 4. Push and test
Commit `firebase-config.js` and push. Open the page and sign in with your account. The accounts open.
Any other Google account gets **🔒 Private**.

## How access works
- Anyone can load the page, but they only see the sign-in screen.
- The accounts live in Firestore under `ledger/{uid}`. The rules allow reading and writing only when the signed-in
  account's verified email is the one in the rules **and** the ledger belongs to that account.
- Your email is kept out of this public repository. It only exists in the rules in the Firebase console.
- The Firebase config values are meant to be public. The rules are what keep people out.
- Data isn't cached in the browser. Signing out leaves nothing behind.

## Importing documents with Claude
On the **Import** page, paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). It is
saved in `ledger/{uid}/secrets/anthropic`, which only your account can read, and it is sent only to `api.anthropic.com`.
Documents go straight from your browser to Anthropic. The originals are stored in Firestore, in chunks under `ledger/{uid}/files`.
Firebase Storage isn't used because it needs the paid plan.
Keep the Import page open while Claude reads the documents.

## Backups
**Settings → Backup** downloads all clients, invoices, expenses and settings as JSON. The same button restores them.
Maltese law requires records to be kept for 6 years. Download a backup now and then.

## Free-plan limits
Firestore's free tier gives 1 GiB of storage and 50,000 reads / 20,000 writes per day. That's plenty for personal
bookkeeping, including scanned receipts.
