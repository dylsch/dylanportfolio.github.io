# Boozy Bingo: login setup

Boozy Bingo only opens for your Google account. Anyone else who signs in can send you an access request, which you approve or decline from the **🔒 Access** tab. All of this runs on Firebase's free plan, so no credit card is needed.

## 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> and click **Create a project**. Any name works, e.g. `boozy-bingo`. You can turn Google Analytics off.
2. On the project home page, click the **Web** icon (`</>`) to add a web app. Give it a nickname. Skip Hosting.
3. Firebase shows a `firebaseConfig` block. Copy `apiKey`, `authDomain`, `projectId` and `appId` into `firebase-config.js`.
4. In the same file, set `BOOZY_ADMIN_EMAIL` to your Gmail address.

## 2. Turn on Google sign-in
1. **Build → Authentication → Get started → Sign-in method → Google → Enable**, then save.
2. **Authentication → Settings → Authorized domains → Add domain**, and add your GitHub Pages domain, e.g. `dylsch.github.io`.

## 3. Create the database and lock it down
1. **Build → Firestore Database → Create database**. Pick a European location (e.g. `eur3` or `europe-west1`) and start in **production mode**.
2. Open the **Rules** tab and replace everything with the contents of `firestore.rules`.
3. Change `YOUR_EMAIL@gmail.com` in the rules to the same email you used in step 1.4, then click **Publish**.

## 4. Push and test
Commit `firebase-config.js` and push. Open the page, sign in with your account, and the app opens. To try the request flow, sign in from a private window with a different Google account and send a request. It appears in your **Access** tab within a second, with a counter badge.

## Good to know
- The Firebase config values are meant to be public. What keeps people out is the Firestore rules: only your verified email can approve people, and anyone else can only file one request for themselves.
- GitHub Pages serves the page code publicly, so the gate stops anyone else from using *your* app. A technical person could still copy the code and run their own version. They would never get your Spotify account or your data.
- You only see new requests while the app is open. Email alerts would need Firebase's paid plan (Cloud Functions) or a service like EmailJS.
- Remove someone from **Allowed people** and their open app locks immediately.
