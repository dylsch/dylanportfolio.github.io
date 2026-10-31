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
Documents (uploaded or from Google Drive) go straight from your browser to Anthropic. The originals are stored in Firestore, in chunks under `ledger/{uid}/files`.
Firebase Storage isn't used because it needs the paid plan.
Keep the Import page open while Claude reads the documents.

## Importing from Google Drive
The **Choose from Google Drive** button on the Import page opens Google's own file picker. You can pick PDFs,
Word documents (`.docx`) and Google Docs. Google Docs are exported as PDF. The app asks Google only for
**access to the files you pick** (the `drive.file` permission), never your whole Drive. The first time, a Google window asks you to allow
this. The permission lasts about an hour, after which it asks again. Files that were already imported from Drive are skipped.

One-time setup in Google Cloud (the Firebase project is also a Google Cloud project):
1. Open <https://console.cloud.google.com/apis/library?project=my-accounts-d5e9f>. Search for and **Enable** both
   **Google Drive API** and **Google Picker API**.
2. Open **APIs & Services → Credentials** and click **Browser key (auto created by Firebase)**. If *API restrictions*
   is set to *Restrict key*, tick **Google Picker API** in the list as well, then save. If it says *Don't restrict key*, leave it.
3. If Google says *"Access blocked"* when you allow Drive, go to **Google Auth Platform → Audience** and add your Gmail address
   as a **test user**, or click **Publish app**. `drive.file` isn't a sensitive permission, so Google doesn't need to review the app.

## Word documents
Claude can't read `.docx` files directly, so they're converted to HTML in your browser first. Text and tables carry over,
using [mammoth](https://github.com/mwilliamson/mammoth.js) (BSD licence, in `vendor/`). The review screen shows the converted
document. Old `.doc` files aren't supported, so save them as `.docx` or PDF. A Word file that only contains a scanned image has no
text to read, so export it as PDF instead.

## Backups
**Settings → Backup** downloads all clients, invoices, expenses and settings as JSON. The same button restores them.
Maltese law requires records to be kept for 6 years. Download a backup now and then.

## Free-plan limits
Firestore's free tier gives 1 GiB of storage and 50,000 reads / 20,000 writes per day. That's plenty for personal
bookkeeping, including scanned receipts.
