# Freelance Accounts: setup

The accounts page (`/accounts/`) uses the **same Firebase project as Party Games** (`boozy-bingo/firebase-config.js`)
and the same Google sign-in. Only your own Google account can open it. Approved Party Games friends can't.

## One-time step: publish the updated rules
The accounts are stored in Firestore under `ledger/{your uid}`. The rules that lock this to your account are in
`boozy-bingo/firestore.rules` (the `ledger` block):

1. Open the [Firebase console](https://console.firebase.google.com) → your project → **Firestore Database → Rules**.
2. Replace everything with the contents of `boozy-bingo/firestore.rules`.
3. Change `YOUR_EMAIL@gmail.com` to your Gmail address (the same one as before), then click **Publish**.

Until the rules are published, the page shows **🔒 Private** even for you.

Google sign-in and the authorised domain (`dylsch.github.io`) are already set up for Party Games, so there's nothing else to do.

## How access works
- Anyone can load the page, but they only see the sign-in screen.
- After sign-in, the page asks Firestore for `ledger/{uid}`. The rules only allow this when the signed-in account's
  verified email is the owner email in the rules **and** the ledger belongs to that account. Anyone else gets "Private".
- Your email is kept out of this public repository. It only exists in the rules in the Firebase console.
- Data isn't cached in the browser. Signing out leaves nothing behind.

## Importing documents with Claude
On the **Import** page, paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). It's saved in
`ledger/{uid}/secrets/anthropic`, which only your account can read, and it is sent only to `api.anthropic.com`.
Documents go straight from your browser to Anthropic. The originals are stored in Firestore, in chunks under `ledger/{uid}/files`.
Firebase Storage isn't used because it needs the paid plan.
Keep the Import page open while Claude reads the documents.

## Backups
**Settings → Backup** downloads all clients, invoices, expenses and settings as JSON. The same button restores them.
Maltese law requires records to be kept for 6 years. Download a backup now and then.

## Free-plan limits
Firestore's free tier gives 1 GiB of storage and 50,000 reads / 20,000 writes per day. That's plenty for personal
bookkeeping, including scanned receipts.
