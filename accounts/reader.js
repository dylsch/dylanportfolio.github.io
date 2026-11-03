// Free, in-browser reading of past invoices and receipts. No AI and no paid service.
//  1. Get the text out of the document: PDFs with pdf.js, Word (.docx) with mammoth (both vendored).
//     Photos and scanned PDFs have no text, so their details are typed in by hand.
//  2. guessDocument() makes a best guess at the type, number, dates, client/supplier and totals.
// Every document then goes to the review screen, where each field is checked against the original.
import * as malta from './malta.js';

export const MEDIA_TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export const DOCX = MEDIA_TYPES.docx;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class ReadError extends Error {}

// ---------------------------------------------------------------- Text extraction (browser only)

let mammothLoading = null;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  return mammothLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/mammoth.browser.min.js', import.meta.url).href;
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => { mammothLoading = null; reject(new ReadError("Couldn't load the Word reader. Check your connection.")); };
    document.head.appendChild(s);
  });
}

export async function docxToHtml(blob) {
  const mammoth = await loadMammoth();
  try {
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    return value;
  } catch {
    throw new ReadError("This Word file couldn't be opened. Old .doc files aren't supported – save it as .docx or PDF.");
  }
}

// HTML → text with one line per paragraph / table row, cells separated by two spaces.
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const walk = node => {
    for (const el of node.childNodes) {
      if (el.nodeType === 3) { out.push(el.textContent); continue; }
      if (el.nodeType !== 1) continue;
      const tag = el.tagName;
      if (tag === 'TR') { out.push('\n' + [...el.children].map(c => c.textContent.trim()).join('  ') + '\n'); continue; }
      if (tag === 'BR') { out.push('\n'); continue; }
      const block = /^(P|H\d|LI|DIV|TABLE|UL|OL)$/.test(tag);
      if (block) out.push('\n');
      walk(el);
      if (block) out.push('\n');
    }
  };
  walk(doc.body);
  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

let pdfjsLoading = null;
function loadPdfjs() {
  return pdfjsLoading ||= import(new URL('./vendor/pdf.min.js', import.meta.url).href).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;
    return pdfjs;
  }).catch(() => { pdfjsLoading = null; throw new ReadError("Couldn't load the PDF reader. Check your connection."); });
}

async function pdfToText(blob) {
  const pdfjs = await loadPdfjs();
  let pdf;
  try { pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise; }
  catch (e) { throw new ReadError(e?.name === 'PasswordException' ? 'This PDF is password-protected.' : "This PDF couldn't be opened."); }
  const lines = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 10); n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    // Rebuild lines: group text pieces by their vertical position, then read left to right.
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) < 3);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      for (const p of r.parts) {
        if (end !== null) text += p.x - end > 15 ? '  ' : (p.x - end > 1 ? ' ' : '');
        text += p.s; end = p.x + p.w;
      }
      lines.push(text.trim());
    }
  }
  return lines.join('\n');
}

export async function documentText(blob, mediaType) {
  if (mediaType === 'application/pdf') return pdfToText(blob);
  if (mediaType === DOCX) return htmlToText(await docxToHtml(blob));
  return '';   // images: nothing to read without OCR
}

// Read one document and make a best guess at its details. ctx: { settings, clients, expenses }
export async function readDocument(blob, mediaType, ctx) {
  const text = await documentText(blob, mediaType);
  return guessDocument(text, ctx, mediaType);
}

// ---------------------------------------------------------------- Guessing (pure, no DOM)

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'GR', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
const norm = s => String(s || '').replace(/\s/g, '').toUpperCase();
const lower = s => String(s || '').toLowerCase();

function iso(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

// All dates in a line. Numeric dates are read as day/month/year, as in Malta.
export function findDates(line) {
  const found = [];
  const add = (index, v) => { if (v) found.push({ index, iso: v }); };
  let m;
  const r1 = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = r1.exec(line))) add(m.index, iso(m[1], m[2], m[3]));
  const r2 = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/g;
  while ((m = r2.exec(line))) add(m.index, iso(m[3], m[2], m[1]));
  const r3 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
  while ((m = r3.exec(line))) add(m.index, iso(m[3], MONTHS[m[2].toLowerCase()], m[1]));
  const r4 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
  while ((m = r4.exec(line))) add(m.index, iso(m[3], MONTHS[m[1].toLowerCase()], m[2]));
  return found.sort((a, b) => a.index - b.index);
}

// Money amounts (with two decimals) in a line, e.g. €1,234.50 / 1234.50 / 1.234,50.
export function findAmounts(line) {
  const out = [];
  const re = /(?<![\d.,])(-?\d{1,3}(?:[,\s]\d{3})+|-?\d+)([.,])(\d{2})(?![\d])/g;
  let m;
  while ((m = re.exec(line))) {
    let whole = m[1].replace(/\s/g, '');
    if (m[2] === ',') whole = whole.replace(/\./g, '');   // 1.234,50
    else whole = whole.replace(/,/g, '');
    if (/^-?\d+$/.test(whole) && !/\d[/.\-]\d{1,2}[/.\-]\d/.test(line.slice(Math.max(0, m.index - 3), m.index + m[0].length + 3)))
      out.push(Number(`${whole}.${m[3]}`));
  }
  return out;
}

const CATEGORY_HINTS = [
  [/\b(go\s*p\.?l\.?c|melita|epic|vodafone|internet|fibre|broadband|mobile|sim card)\b/i, 'Phone & internet'],
  [/\b(microsoft|office 365|adobe|google workspace|dropbox|zoom|canva|chatgpt|openai|anthropic|software|subscription|licen[cs]e)\b/i, 'Software & subscriptions'],
  [/\b(scan|laptop|computer|monitor|keyboard|mouse|printer|ipad|tablet|apple|dell|lenovo|hp )\b/i, 'Computer & equipment'],
  [/\b(fuel|petrol|diesel|bolt|uber|ecabs|tallinja|ferry|gozo channel|parking|taxi)\b/i, 'Travel (fuel, Bolt, Tallinja, Gozo ferry)'],
  [/\b(book|course|training|udemy|coursera|seminar|conference|agenda bookshop)\b/i, 'Books, courses & training'],
  [/\b(stationery|printing|paper|toner|ink|maltapost|postage|stamps)\b/i, 'Printing, stationery & postage'],
  [/\b(enemalta|arms|electricity|water)\b/i, 'Home office (business share of utilities)'],
  [/\b(accountant|audit|accounting|legal|notary|advocate)\b/i, 'Accountant & professional fees'],
  [/\b(membership|association|chamber|institute)\b/i, 'Professional memberships'],
  [/\b(domain|hosting|website|advert|facebook ads|marketing)\b/i, 'Marketing & website'],
  [/\b(bank charge|bank fee|revolut|paypal fee|transaction fee)\b/i, 'Bank & payment fees'],
  [/\b(insurance|policy)\b/i, 'Insurance'],
];

const SKIP_PARTY = /^(invoice|tax invoice|vat invoice|fiscal receipt|receipt|bill|statement|page \d|date|number|no\.?|description|qty|total)\b/i;

export function guessDocument(text, ctx = {}, mediaType = '') {
  const settings = ctx.settings || {};
  const clients = ctx.clients || [];
  const lines = String(text || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const all = lines.join('\n');
  const flat = lower(all);
  const warnings = [];
  const doc = {
    document_type: 'purchase', number: '', issue_date: '', due_date: '', paid: false, paid_date: '',
    counterparty: { name: '', address: '', email: '', vat_number: '', country: 'MT', is_business: true },
    currency: 'EUR', lines: [], total_net: 0, total_vat: 0, total_gross: 0,
    expense_category: '', notes: '', warnings, business_pct: 100,
  };

  if (!lines.length) {
    warnings.push(mediaType.startsWith('image/')
      ? 'Photos can’t be read automatically – fill in the details from the picture on the left.'
      : 'This document has no readable text (it may be a scan) – fill in the details from the original on the left.');
    doc.lines = [{ description: '', quantity: 1, unit_price: 0, vat_treatment: malta.defaultVatTreatment(settings.vat_registration, 'MT', true) }];
    return doc;
  }

  // Which side am I on? My IBAN, VAT/ID number or invoice prefix point to my own invoice.
  const flatNorm = norm(all);
  let mine = 0;
  if (settings.iban && flatNorm.includes(norm(settings.iban))) mine += 3;
  if (settings.vat_number && flatNorm.includes(norm(settings.vat_number))) mine += 2;
  if (settings.id_card && flatNorm.includes(norm(settings.id_card))) mine += 2;
  const prefix = (settings.invoice_prefix || 'INV').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownNumber = all.match(new RegExp(`\\b${prefix}-\\d{4}-\\d{1,5}\\b`));
  if (ownNumber) mine += 3;
  const ownNames = [settings.full_name, settings.trading_name].filter(Boolean).map(lower);
  const nameAt = lines.findIndex(l => ownNames.some(n => lower(l).includes(n)));
  if (nameAt >= 0 && nameAt < 5) mine += 1;
  const billTo = lines.findIndex(l => /\b(bill(ed)? to|invoice to|sold to|customer|client|attention|attn)\b/i.test(l));
  if (nameAt >= 0 && billTo >= 0 && nameAt >= billTo && nameAt <= billTo + 2) mine -= 3;   // I'm the customer
  doc.document_type = mine >= 2 ? 'sales_invoice' : 'purchase';
  const sales = doc.document_type === 'sales_invoice';

  // Number
  if (sales && ownNumber) doc.number = ownNumber[0];
  else {
    for (const l of lines) {
      const m = l.match(/\b(?:invoice|inv|receipt|bill|document|doc|ref(?:erence)?)\s*(?:no\.?|number|num|nr\.?|#)?\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/.]{0,24}\d[A-Z0-9\-/]*)/i);
      if (m && !findDates(m[1]).length) { doc.number = m[1].replace(/[.]$/, ''); break; }
    }
  }

  // Dates
  for (const l of lines) {
    const ds = findDates(l);
    if (!ds.length) continue;
    if (/\b(due|payable by|pay by|payment date)\b/i.test(l) && !doc.due_date) doc.due_date = ds[ds.length - 1].iso;
    else if (/\bpaid\b/i.test(l) && !doc.paid_date) doc.paid_date = ds[0].iso;
    else if (!doc.issue_date) doc.issue_date = ds[0].iso;
  }
  if (!doc.issue_date && doc.due_date) { doc.issue_date = doc.due_date; doc.due_date = ''; warnings.push('Only one date found – check the date of issue.'); }

  // Totals
  const lastAmount = l => { const a = findAmounts(l); return a.length ? a[a.length - 1] : null; };
  let gross = null, net = null, vat = null, vatTotal = null;
  for (const l of lines) {
    const t = lower(l);
    const amt = lastAmount(l);
    if (amt === null) continue;
    if (/(sub-?total|net total|total net|total excl|excl\.? vat|amount excl|net amount|total before vat)/.test(t)) { if (net === null) net = amt; continue; }
    if (/\b(vat|tax)\b/.test(t) && !/(vat|tax)\s*(no|number|reg|id)\b|(total|amount)\W*\(?incl/.test(t)) {
      if (/total/.test(t)) vatTotal = amt; else vat = (vat || 0) + amt;
      continue;
    }
    if (/(grand total|total due|amount due|balance due|total payable|amount payable|total to pay|total incl|total amount|\btotal\b|amount paid|to pay)/.test(t))
      gross = gross === null ? amt : Math.max(gross, amt);
  }
  if (vatTotal !== null) vat = vatTotal;
  if (gross === null && net !== null) gross = net + (vat || 0);
  if (gross === null) {
    const amounts = lines.flatMap(findAmounts).filter(a => a > 0);
    if (amounts.length) { gross = Math.max(...amounts); warnings.push('No total label found – the largest amount was used as the total.'); }
  }
  gross = gross || 0;
  if (vat === null && net !== null && gross > net) vat = Math.round((gross - net) * 100) / 100;
  vat = vat || 0;
  if (net === null) net = Math.round((gross - vat) * 100) / 100;
  if (Math.abs(net + vat - gross) > 0.05) { net = Math.round((gross - vat) * 100) / 100; warnings.push('Net, VAT and total didn’t add up – check the amounts.'); }
  Object.assign(doc, { total_gross: gross, total_vat: vat, total_net: net });
  doc.currency = /\b(usd|us\$)\b|\$\s?\d/i.test(all) && !/€|eur\b/i.test(all) ? 'USD' : /£|\bgbp\b/i.test(all) && !/€|eur\b/i.test(all) ? 'GBP' : 'EUR';

  // Client or supplier
  const vats = [...all.matchAll(/\b([A-Z]{2})\s?(\d[\d ]{6,12}\d)\b/g)]
    .map(m => m[1] + m[2].replace(/\s/g, '')).filter(v => EU.includes(v.slice(0, 2)) && v !== norm(settings.vat_number));
  const party = doc.counterparty;
  if (vats.length) party.vat_number = vats[0];
  const known = clients.find(c => c.vat_number && vats.includes(norm(c.vat_number)))
    || clients.find(c => c.name && c.name.length > 2 && flat.includes(lower(c.name)));
  const pastSuppliers = [...new Set((ctx.expenses || []).map(e => e.supplier).filter(s => s && s.length > 2))];
  if (sales && known) Object.assign(party, { name: known.name, vat_number: known.vat_number || party.vat_number, country: known.country, is_business: !!known.is_business });
  else if (sales && billTo >= 0) {
    const after = lines[billTo].split(/:\s*/).slice(1).join(': ').trim();
    party.name = after || lines[billTo + 1] || '';
    party.address = lines.slice(billTo + (after ? 1 : 2), billTo + (after ? 3 : 4)).filter(l => !findAmounts(l).length && !findDates(l).length).join('\n');
  } else if (!sales) {
    const supplier = pastSuppliers.find(s => flat.includes(lower(s)));
    party.name = supplier || lines.find(l => /[a-z]{2}/i.test(l) && l.length <= 60 && !SKIP_PARTY.test(l)
      && !ownNames.some(n => lower(l).includes(n)) && !findDates(l).length && !findAmounts(l).length) || '';
    if (party.name && !supplier) warnings.push('Supplier name taken from the top of the document – check it.');
  }
  // Keep VAT numbers and trailing punctuation out of the name ("Acme Ltd, MT22222222").
  party.name = party.name.replace(/\b(vat\s*(no\.?|number)?\s*:?\s*)?[A-Z]{2}\s?\d[\d ]{6,12}\d\b/gi, '').replace(/[\s,;:–-]+$/, '').trim();
  if (sales && !party.name) warnings.push('Client not found – choose or enter the client.');
  if (party.vat_number) party.country = party.vat_number.startsWith('MT') ? 'MT' : 'EU';
  const email = all.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g)?.find(e => lower(e) !== lower(settings.email));
  if (email) party.email = email;

  // Paid?
  if (/\b(paid|payment received|thank you for your payment|card payment|visa|mastercard|cash)\b/i.test(all) && !/\bunpaid\b/i.test(all)) {
    doc.paid = true;
    if (!sales && !doc.paid_date) doc.paid_date = doc.issue_date;
  }

  // Lines
  if (sales) {
    const rate = net > 0 ? vat / net * 100 : 0;
    const treatment = vat > 0
      ? (Math.abs(rate - 18) < 1 ? 'standard' : Math.abs(rate - 7) < 1 ? 'reduced7' : Math.abs(rate - 5) < 1 ? 'reduced5' : 'standard')
      : /reverse charge/i.test(all) ? 'reverse' : /outside the scope/i.test(all) ? 'outside' : /exempt without credit/i.test(all) ? 'exempt'
      : malta.defaultVatTreatment(settings.vat_registration, party.country, party.is_business);
    if (vat > 0 && treatment === 'standard' && Math.abs(rate - 18) >= 1) warnings.push('The VAT rate isn’t 18%, 7% or 5% – check the VAT.');
    const descLine = lines.find(l => /\b(lectur|tuition|supervision|consult|correction|verification|services?|sessions?|fee|course)/i.test(l)
      && !/\b(total|description|qty|quantity|amount|vat|exempt)\b/i.test(l));
    doc.lines = [{ description: descLine ? descLine.replace(/(\s+€?-?\d[\d,.]*)+\s*$/, '').slice(0, 120) : (doc.number ? `As per invoice ${doc.number}` : 'Services'),
      quantity: 1, unit_price: net, vat_treatment: treatment }];
  } else {
    const hint = CATEGORY_HINTS.find(([re]) => re.test(all));
    doc.expense_category = hint ? hint[1] : 'Other';
    doc.lines = [{ description: party.name ? `${party.name}${hint ? ' – ' + hint[1].split(' (')[0].toLowerCase() : ''}` : 'Purchase' }];
  }
  return doc;
}
