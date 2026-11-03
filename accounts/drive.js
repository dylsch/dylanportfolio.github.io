// Google Drive: pick invoices with Google's own file picker and download them.
// The app asks only for the `drive.file` permission, so it can read the files you pick in the
// picker and nothing else in your Drive.
import { DOCX } from './reader.js';

const GOOGLE_DOC = 'application/vnd.google-apps.document';
export const DRIVE_MIME_TYPES = ['application/pdf', DOCX, GOOGLE_DOC];

let loading = null;
function loadPicker() {
  if (window.google?.picker) return Promise.resolve();
  return loading ||= new Promise((resolve, reject) => {
    const fail = () => { loading = null; reject(new Error("Couldn't load Google Drive. Check your connection and try again.")); };
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => window.gapi.load('picker', { callback: resolve, onerror: fail, timeout: 15000, ontimeout: fail });
    s.onerror = fail;
    document.head.appendChild(s);
  });
}

// Shows the picker; resolves with the chosen files ([] if cancelled).
export async function pickFiles(token, { apiKey, appId }) {
  await loadPicker();
  const P = window.google.picker;
  return new Promise(resolve => {
    const types = DRIVE_MIME_TYPES.join(',');
    const all = new P.DocsView(P.ViewId.DOCS).setMimeTypes(types);                                    // every matching file, searchable
    const folders = new P.DocsView(P.ViewId.DOCS).setMimeTypes(types).setIncludeFolders(true).setParent('root'); // browse My Drive
    const shared = new P.DocsView(P.ViewId.DOCS).setMimeTypes(types).setIncludeFolders(true).setEnableDrives(true);
    new P.PickerBuilder()
      .setTitle('Choose invoices or receipts (PDF, Word or Google Docs)')
      .addView(all).addView(folders).addView(shared)
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .enableFeature(P.Feature.SUPPORT_DRIVES)
      .setOAuthToken(token).setDeveloperKey(apiKey).setAppId(appId)
      .setCallback(d => {
        if (d.action === P.Action.PICKED) resolve(d.docs.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: Number(f.sizeBytes || 0) })));
        else if (d.action === P.Action.CANCEL) resolve([]);
      })
      .build().setVisible(true);
  });
}

// Downloads one picked file. Google Docs are exported as PDF.
export async function downloadFile(token, file) {
  const id = encodeURIComponent(file.id);
  const isGoogleDoc = file.mimeType === GOOGLE_DOC;
  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application%2Fpdf`
    : `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
  let res;
  try { res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); }
  catch { throw new Error('Could not reach Google Drive.'); }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* not JSON */ }
    if (res.status === 401) throw new Error('Google Drive sign-in expired – try again.');
    if (res.status === 403 && /has not been used|is disabled/i.test(msg)) throw new Error('The Google Drive API is not enabled for this Firebase project – see SETUP.md.');
    throw new Error(`Google Drive refused the download (${res.status}${msg ? ': ' + msg : ''}).`);
  }
  const type = isGoogleDoc ? 'application/pdf' : file.mimeType;
  const name = isGoogleDoc && !/\.pdf$/i.test(file.name) ? `${file.name}.pdf` : file.name;
  return { blob: new Blob([await res.blob()], { type }), name, type };
}
