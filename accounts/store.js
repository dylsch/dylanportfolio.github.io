// Firestore storage for the accounts, all under ledger/{uid}. Only the owner's account can read
// or write there (see firestore.rules). Everything is kept in memory and updated live.
//
//   ledger/{uid}                     { settings }
//   ledger/{uid}/clients|invoices|expenses|imports/{id}
//   ledger/{uid}/files/{id}          { name, type, size, chunks }  original documents,
//   ledger/{uid}/files/{id}/chunks/{n} { data }                       base64 in ≤700 KB pieces
//   ledger/{uid}/secrets/anthropic   { key }                          Anthropic API key
export const COLLECTIONS = ['clients', 'invoices', 'expenses', 'imports'];
const CHUNK = 700_000; // base64 characters per chunk; Firestore documents max out at 1 MiB

export function firestoreStore(db, fs, uid) {
  const { doc, collection, onSnapshot, writeBatch, getDoc, getDocs, setDoc, deleteField } = fs;
  const root = doc(db, 'ledger', uid);
  const data = { settings: {}, clients: {}, invoices: {}, expenses: {}, imports: {} };
  const subs = new Set();
  const unsubs = [];
  const notify = () => subs.forEach(cb => cb());

  const ready = new Promise((resolve, reject) => {
    let pending = COLLECTIONS.length + 1;
    const loaded = () => { if (--pending === 0) resolve(); };
    let first = true;
    unsubs.push(onSnapshot(root, snap => {
      data.settings = (snap.exists() && snap.data().settings) || {};
      if (first) { first = false; loaded(); } else notify();
    }, reject));
    for (const name of COLLECTIONS) {
      let firstC = true;
      unsubs.push(onSnapshot(collection(root, name), snap => {
        const next = {};
        snap.forEach(d => next[d.id] = { ...d.data(), id: d.id });
        data[name] = next;
        if (firstC) { firstC = false; loaded(); } else notify();
      }, reject));
    }
  });

  const clean = obj => { const { id, ...rest } = obj; return JSON.parse(JSON.stringify(rest)); };

  return {
    data, ready,
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    stop() { unsubs.forEach(u => u()); },
    newId: () => doc(collection(root, 'ids')).id,

    // ops: [{ set: [collection, id, fields] } | { del: [collection, id] } | { settings: {...} }]
    async commit(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + 400)) {
          if (op.settings) batch.set(root, { settings: op.settings }, { merge: true });
          else if (op.set) batch.set(doc(root, op.set[0], op.set[1]), clean(op.set[2]));
          else if (op.del) batch.delete(doc(root, op.del[0], op.del[1]));
        }
        await batch.commit();
      }
    },

    async putFile(blob, name) {
      const id = doc(collection(root, 'files')).id;
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(blob);
      });
      const n = Math.max(1, Math.ceil(b64.length / CHUNK));
      for (let i = 0; i < n; i++) await setDoc(doc(root, 'files', id, 'chunks', String(i)), { data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
      await setDoc(doc(root, 'files', id), { name, type: blob.type, size: blob.size, chunks: n, created: new Date().toISOString() });
      return id;
    },

    async getFile(id) {
      const meta = await getDoc(doc(root, 'files', id));
      if (!meta.exists()) throw new Error('The original document is no longer stored.');
      const { type, chunks } = meta.data();
      const parts = await Promise.all(Array.from({ length: chunks }, (_, i) => getDoc(doc(root, 'files', id, 'chunks', String(i)))));
      const bin = atob(parts.map(p => p.data().data).join(''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type });
    },

    async deleteFile(id) {
      const chunks = await getDocs(collection(root, 'files', id, 'chunks'));
      const batch = writeBatch(db);
      chunks.forEach(c => batch.delete(c.ref));
      batch.delete(doc(root, 'files', id));
      await batch.commit();
    },

    async getApiKey() {
      const s = await getDoc(doc(root, 'secrets', 'anthropic'));
      return s.exists() ? s.data().key || '' : '';
    },
    async setApiKey(key) {
      await setDoc(doc(root, 'secrets', 'anthropic'), { key: key || deleteField() }, { merge: true });
    },
  };
}
