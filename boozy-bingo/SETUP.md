# Boozy Bingo: login setup

Boozy Bingo only opens for your Google account. Anyone else who signs in can send you an access request, which you approve or decline from the **🔒 Access** tab. All of this runs on Firebase's free plan, so no credit card is needed.

## 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> and click **Create a project**. Any name works, e.g. `boozy-bingo`. You can turn Google Analytics off.
2. On the project home page, click the **Web** icon (`</>`) to add a web app. Give it a nickname. Skip Hosting.
3. Firebase shows a `firebaseConfig` block. Copy `apiKey`, `authDomain`, `projectId` and `appId` into `firebase-config.js`.
4. Leave `BOOZY_LOGIN_ENABLED` as `true`. Your email does **not** go in this file: it only goes in the Firestore rules (step 3), which stay private in the Firebase console.

## 2. Turn on Google sign-in
1. **Build → Authentication → Get started → Sign-in method → Google → Enable**, then save.
2. **Authentication → Settings → Authorized domains → Add domain**, and add your GitHub Pages domain, e.g. `dylsch.github.io`.

3. For live games (players join from their phones by QR code): **Sign-in method → Add new provider → Anonymous → Enable**. Players don't need a Google account. They only get access to the games you share with them.

## 3. Create the database and lock it down
1. **Build → Firestore Database → Create database**. Pick a European location (e.g. `eur3` or `europe-west1`) and start in **production mode**.
2. Open the **Rules** tab and replace everything with the contents of `firestore.rules`.
3. Change `YOUR_EMAIL@gmail.com` in the rules to your Gmail address, then click **Publish**. That account becomes the owner.

## 4. Push and test
Commit `firebase-config.js` and push. Open the page, sign in with your account, and the app opens. To try the request flow, sign in from a private window with a different Google account and send a request. It appears in your **Access** tab within a second, with a counter badge.

## Good to know
- The Firebase config values are meant to be public. What keeps people out is the Firestore rules: only your verified email can approve people, and anyone else can only file one request for themselves.
- GitHub Pages serves the page code publicly, so the gate stops anyone else from using *your* app. A technical person could still copy the code and run their own version. They would never get your Spotify account or your data.
- Live games: open **📱 Play on phones** (or **📱 Let players join** in the quiz menu) (online, signed in) and show the QR code. A player can only see the game whose code they scanned, only edit their own name and answers, and can't change their card or award themselves a bingo. Approved friends can host their own live games too.
- If you update the rules later, re-publish the whole `firestore.rules` file in the console (with your email filled in).
- You only see new requests while the app is open. Email alerts would need Firebase's paid plan (Cloud Functions) or a service like EmailJS.
- Remove someone from **Allowed people** and their open app locks immediately.
