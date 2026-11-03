// Bookkeeping logic shared by the pages: totals, the year summary, CSV exports and turning
// imported documents and spreadsheets into invoices and expenses. Pure functions over the store's data.
import * as malta from './malta.js';

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'cancelled'];
// Invoices that count as income (accruals basis: by issue date).
export const BILLED = ['sent', 'paid'];
// Supplies left out of the Article 11 domestic turnover figure.
export const NOT_DOMESTIC = ['reverse', 'outside', 'exempt'];

export const DEFAULT_SETTINGS = {
  full_name: '', trading_name: '', address: '', email: '', phone: '', id_card: '', vat_number: '',
  vat_registration: 'article11', tax_status: 'single', employment_income: '0',
  part_time_regime: '1', pays_class2: '0', provisional_tax: '0', payment_terms_days: '30',
  bank_name: '', iban: '', bic: '', invoice_prefix: 'INV', invoice_footer: 'Thank you for your business.',
};

// ---------------------------------------------------------------- Helpers

export function toCents(text) {
  const t = String(text ?? '').trim().replace(/€/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (!t) return 0;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) throw new Error(`'${text}' is not a valid amount`);
  return malta.roundHalfUp(Number(t) * 100);
}

export function eur(cents) {
  const v = (cents || 0) / 100;
  return (v < 0 ? '-' : '') + '€' + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const plain = cents => ((cents || 0) / 100).toFixed(2);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseDate(text, fallback) {
  const t = String(text ?? '').trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(t + 'T12:00:00Z') : null;
  if (d && !isNaN(d) && d.toISOString().slice(0, 10) === t) return t;   // rejects e.g. 31 February
  if (fallback === undefined) throw new Error('Please enter a valid date');
  return fallback;
}

export const settingsOf = data => ({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
export const list = obj => Object.values(obj || {});

export function nextInvoiceNumber(data, year) {
  const prefix = settingsOf(data).invoice_prefix || 'INV';
  let highest = 0;
  for (const inv of list(data.invoices)) {
    if (!inv.number.startsWith(`${prefix}-${year}-`)) continue;
    const tail = inv.number.split('-').pop();
    if (/^\d+$/.test(tail)) highest = Math.max(highest, Number(tail));
  }
  return `${prefix}-${year}-${String(highest + 1).padStart(3, '0')}`;
}

export function invoiceTotals(inv) {
  const net = (inv.lines || []).reduce((s, l) => s + l.net_cents, 0);
  const vat = (inv.lines || []).reduce((s, l) => s + l.vat_cents, 0);
  return { net, vat, gross: net + vat };
}

// Business share of an expense that counts against profit. VAT you cannot recover (e.g. as an
// Article 11 registrant) is part of the cost; recoverable VAT is claimed on the VAT return instead.
export function expenseCost(e) {
  const base = e.net_cents + (e.vat_recoverable ? 0 : e.vat_cents);
  return Math.trunc(base * e.business_pct / 100);
}

export const expenseInputVat = e => e.vat_recoverable ? Math.trunc(e.vat_cents * e.business_pct / 100) : 0;

export const normVat = v => String(v || '').replace(/\s/g, '').toUpperCase();
export const normName = n => String(n || '').trim().toLowerCase();

export function matchClient(data, party) {
  const vat = normVat(party.vat_number);
  const clients = list(data.clients);
  return (vat && clients.find(c => normVat(c.vat_number) === vat))
    || clients.find(c => normName(c.name) === normName(party.name)) || null;
}

// ---------------------------------------------------------------- Year summary

export function yearSummary(data, year) {
  const settings = settingsOf(data);
  const inYear = d => d && d.startsWith(`${year}-`);
  const clientName = id => data.clients?.[id]?.name || '(deleted client)';

  const lines = [];
  for (const inv of list(data.invoices)) {
    if (!BILLED.includes(inv.status) || !inYear(inv.issue_date)) continue;
    for (const l of inv.lines || []) lines.push({ ...l, issue_date: inv.issue_date, client_name: clientName(inv.client_id) });
  }
  const expenses = list(data.expenses).filter(e => inYear(e.date)).sort((a, b) => a.date.localeCompare(b.date));

  const incomeNet = lines.reduce((s, l) => s + l.net_cents, 0);
  const outputVat = lines.reduce((s, l) => s + l.vat_cents, 0);
  const domesticTurnover = lines.filter(l => !NOT_DOMESTIC.includes(l.vat_treatment)).reduce((s, l) => s + l.net_cents, 0);

  const byClient = {};
  lines.forEach(l => byClient[l.client_name] = (byClient[l.client_name] || 0) + l.net_cents);
  const byCategory = {};
  expenses.forEach(e => byCategory[e.category] = (byCategory[e.category] || 0) + expenseCost(e));
  const expenseTotal = Object.values(byCategory).reduce((s, v) => s + v, 0);

  const quarters = {};
  for (let q = 1; q <= 4; q++) quarters[q] = { sales: 0, output_vat: 0, purchases: 0, input_vat: 0 };
  lines.forEach(l => { const q = quarters[malta.vatQuarter(l.issue_date)]; q.sales += l.net_cents; q.output_vat += l.vat_cents; });
  expenses.forEach(e => {
    const q = quarters[malta.vatQuarter(e.date)];
    q.purchases += Math.trunc(e.net_cents * e.business_pct / 100);
    q.input_vat += expenseInputVat(e);
  });
  Object.values(quarters).forEach(q => q.payable = q.output_vat - q.input_vat);

  const profit = incomeNet - expenseTotal;
  let employment = 0;
  try { employment = toCents(settings.employment_income); } catch { employment = 0; }
  const estimate = malta.estimateTax(employment, profit, settings.tax_status, settings.part_time_regime === '1');
  const class2 = settings.pays_class2 === '1' ? malta.class2Estimate(profit) : 0;

  const outstanding = list(data.invoices).filter(i => i.status === 'sent')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map(i => ({ ...i, client_name: clientName(i.client_id), ...invoiceTotals(i) }));

  const sortDesc = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  return {
    year, incomeNet, outputVat, expenseTotal, profit,
    byClient: sortDesc(byClient), byCategory: sortDesc(byCategory),
    quarters, domesticTurnover, threshold: malta.ARTICLE11_THRESHOLD * 100,
    estimate, class2, outstanding, today: todayIso(),
  };
}

export function upcomingDeadlines(settings, year, today = todayIso()) {
  const args = [settings.vat_registration, settings.part_time_regime === '1', settings.pays_class2 === '1', settings.provisional_tax === '1'];
  const until = addDays(today, 180);
  const seen = new Set();
  return [...malta.deadlines(year - 1, ...args), ...malta.deadlines(year, ...args)]
    .filter(d => d.date >= today && d.date <= until)
    .filter(d => { const k = d.date + d.label; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------- CSV exports

function csv(rows) {
  return rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n') + '\r\n';
}

export function invoicesCsv(data, year) {
  const rows = [['Number', 'Issue date', 'Due date', 'Status', 'Paid date', 'Client', 'Client VAT no',
    'Description', 'Qty', 'Unit price', 'VAT treatment', 'Net', 'VAT', 'Gross']];
  list(data.invoices).filter(i => i.issue_date.startsWith(`${year}-`))
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number))
    .forEach(i => {
      const c = data.clients?.[i.client_id] || {};
      (i.lines || []).forEach(l => rows.push([i.number, i.issue_date, i.due_date, i.status, i.paid_date || '',
        c.name || '', c.vat_number || '', l.description, l.quantity, plain(l.unit_price_cents), l.vat_treatment,
        plain(l.net_cents), plain(l.vat_cents), plain(l.net_cents + l.vat_cents)]));
    });
  return csv(rows);
}

export function expensesCsv(data, year) {
  const rows = [['Date', 'Supplier', 'Description', 'Category', 'Net', 'VAT', 'Gross', 'Business %',
    'VAT recoverable', 'Allowable cost', 'Reference']];
  list(data.expenses).filter(e => e.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date))
    .forEach(e => rows.push([e.date, e.supplier, e.description, e.category, plain(e.net_cents), plain(e.vat_cents),
      plain(e.net_cents + e.vat_cents), e.business_pct, e.vat_recoverable ? 'yes' : 'no', plain(expenseCost(e)), e.reference]));
  return csv(rows);
}

// ---------------------------------------------------------------- Imported documents

const money2 = n => Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Reasons an extracted document must be reviewed by a person before saving.
export function problems(doc) {
  const issues = [...(doc.warnings || [])];
  if (doc.document_type === 'other') issues.push('This does not look like an invoice or receipt.');
  const cur = String(doc.currency || '').toUpperCase();
  if (cur && cur !== 'EUR') issues.push(`Amounts are in ${doc.currency}, not euro – convert before saving.`);
  if (!doc.issue_date) issues.push('No date of issue found.');
  if (!String(doc.counterparty?.name || '').trim()) issues.push('No client or supplier name found.');
  if (!doc.lines?.length) issues.push('No line items found.');
  if (doc.document_type === 'sales_invoice' && !String(doc.number || '').trim()) issues.push('No invoice number found.');

  // Work in cents to avoid floating-point drift.
  const c = n => Math.round(Number(n || 0) * 100);
  let net = 0, vat = 0;
  for (const l of doc.lines || []) {
    const n = Number(l.quantity) * c(l.unit_price);
    net += n;
    vat += n * (malta.VAT_TREATMENTS[l.vat_treatment]?.rate || 0) / 100;
  }
  const tol = 5;
  // Supplier receipts often list VAT-inclusive prices, so line checks only apply to own invoices.
  if (doc.document_type === 'sales_invoice') {
    if (Math.abs(net - c(doc.total_net)) > tol) issues.push(`Lines add up to €${money2(net / 100)} but the invoice's net total is €${money2(doc.total_net)}.`);
    if (Math.abs(vat - c(doc.total_vat)) > tol) issues.push(`VAT works out at €${money2(vat / 100)} but the invoice shows €${money2(doc.total_vat)}.`);
  }
  if (!(Number(doc.total_gross) > 0)) issues.push('No total amount found.');
  if (Math.abs(c(doc.total_net) + c(doc.total_vat) - c(doc.total_gross)) > tol) issues.push('Net + VAT does not equal the total payable.');
  return issues;
}

// A reason the document looks already recorded, or null.
export function duplicateOf(data, doc) {
  if (doc.document_type === 'sales_invoice') {
    if (doc.number && list(data.invoices).some(i => i.number === doc.number))
      return `Invoice number ${doc.number} is already in your accounts.`;
  } else {
    const gross = Math.round(Number(doc.total_gross || 0) * 100);
    if (list(data.expenses).some(e => e.date === doc.issue_date && normName(e.supplier) === normName(doc.counterparty?.name)
      && e.net_cents + e.vat_cents === gross))
      return 'An expense from this supplier with the same date and amount is already recorded.';
  }
  return null;
}

// Store operations that turn a document into an invoice or expense and mark the import done.
// `newId` makes document ids; `clientId` forces a client match (from the review screen).
export function documentOps(data, importRow, doc, newId, clientId = null) {
  const settings = settingsOf(data);
  const ops = [];
  let recordType, recordId = newId();
  if (doc.document_type === 'sales_invoice') {
    recordType = 'invoice';
    if (!clientId) {
      const match = matchClient(data, doc.counterparty);
      if (match) clientId = match.id;
      else {
        clientId = newId();
        const p = doc.counterparty;
        ops.push({ set: ['clients', clientId, {
          name: p.name.trim(), address: p.address || '', email: p.email || '', vat_number: normVat(p.vat_number),
          country: p.country || 'MT', is_business: p.is_business !== false, notes: '',
        }] });
      }
    }
    const due = doc.due_date || addDays(doc.issue_date, Number(settings.payment_terms_days || 30));
    const status = doc.paid ? 'paid' : 'sent';
    const lines = doc.lines.map(l => {
      const unit = Math.round(Number(l.unit_price) * 100);
      const [net, vat] = malta.lineAmounts(l.quantity, unit, l.vat_treatment);
      return { description: l.description, quantity: Number(l.quantity), unit_price_cents: unit,
        vat_treatment: l.vat_treatment, net_cents: net, vat_cents: vat };
    });
    ops.push({ set: ['invoices', recordId, {
      number: doc.number, client_id: clientId, issue_date: doc.issue_date, due_date: due, status,
      paid_date: status === 'paid' ? (doc.paid_date || null) : null, notes: doc.notes || '',
      lines, source_file: importRow.file_id || null,
    }] });
  } else {
    recordType = 'expense';
    const gross = Math.round(Number(doc.total_gross) * 100);
    const vat = Math.min(Math.round(Number(doc.total_vat || 0) * 100), gross);
    const category = malta.EXPENSE_CATEGORIES.includes(doc.expense_category) ? doc.expense_category : 'Other';
    ops.push({ set: ['expenses', recordId, {
      date: doc.issue_date, supplier: doc.counterparty.name.trim(),
      description: doc.lines.map(l => l.description).join('; ').slice(0, 200), category,
      net_cents: gross - vat, vat_cents: vat, business_pct: Number(doc.business_pct || 100),
      vat_recoverable: settings.vat_registration === 'article10' && vat > 0,
      reference: doc.number || '', source_file: importRow.file_id || null,
    }] });
  }
  ops.push({ set: ['imports', importRow.id, { ...importRow, status: 'imported', record_type: recordType, record_id: recordId, doc }] });
  return ops;
}

// ---------------------------------------------------------------- Spreadsheet (CSV) import
//
// Uses the same columns as the CSV exports, so an export can be imported again. Invoices: one row
// per invoice line; rows with the same Number form one invoice. Expenses: one row per expense.

export const INVOICE_COLUMNS = ['Number', 'Issue date', 'Due date', 'Status', 'Paid date', 'Client', 'Client VAT no',
  'Description', 'Qty', 'Unit price', 'VAT treatment', 'Net', 'VAT', 'Gross'];
export const EXPENSE_COLUMNS = ['Date', 'Supplier', 'Description', 'Category', 'Net', 'VAT', 'Gross', 'Business %',
  'VAT recoverable', 'Allowable cost', 'Reference'];

export const invoiceTemplateCsv = () => csv([INVOICE_COLUMNS,
  ['INV-2025-001', '15/01/2025', '14/02/2025', 'paid', '10/02/2025', 'IDEA College', '', 'Lecturing – 20 hours', '20', '40.00', 'exempt', '', '', ''],
  ['INV-2025-001', '15/01/2025', '14/02/2025', 'paid', '10/02/2025', 'IDEA College', '', 'Dissertation corrections', '3', '60.00', 'exempt', '', '', ''],
  ['INV-2025-002', '03/03/2025', '', 'sent', '', 'Acme Ltd', 'MT12345678', 'Consulting', '1', '500.00', 'article11', '', '', '']]);
export const expenseTemplateCsv = () => csv([EXPENSE_COLUMNS,
  ['05/01/2025', 'GO plc', 'Mobile bill January', 'Phone & internet', '', '', '30.00', '50', 'no', '', 'GO-0001'],
  ['20/02/2025', 'Scan Computers', 'Laptop', 'Computer & equipment', '', '180.00', '1180.00', '100', 'no', '', 'R-77']]);

// Splits CSV text into rows. Handles quotes, and comma or semicolon separators (Excel in Europe).
export function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

// Dates as YYYY-MM-DD or day/month/year (/, - or .).
export function csvDate(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/))) [, d, mo, y] = m;
  else throw new Error(`'${t}' is not a date (use DD/MM/YYYY)`);
  y = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return parseDate(iso, null) || (() => { throw new Error(`'${t}' is not a real date`); })();
}

export function csvVatTreatment(text, fallback) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return fallback;
  if (malta.VAT_TREATMENTS[t]) return t;
  const byLabel = Object.entries(malta.VAT_TREATMENTS).find(([, v]) => v.label.toLowerCase() === t);
  if (byLabel) return byLabel[0];
  if (/^18\s*%?$/.test(t) || t.startsWith('standard')) return 'standard';
  if (/^7\s*%?$/.test(t)) return 'reduced7';
  if (/^5\s*%?$/.test(t)) return 'reduced5';
  if (/^0\s*%?$/.test(t) || t.startsWith('zero')) return 'zero';
  if (t.includes('reverse')) return 'reverse';
  if (t.includes('outside')) return 'outside';
  if (t.includes('exempt') && !t.includes('article')) return 'exempt';
  if (t.includes('11')) return 'article11';
  throw new Error(`Unknown VAT treatment '${text}'`);
}

// Works out what a CSV file would add, without saving anything.
// Returns { kind, ops, invoices, expenses, newClients, skipped: [..], errors: [..] }.
export function planCsvImport(data, text, newId) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file is empty or has only a header row.');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = name => header.indexOf(name.toLowerCase());
  const kind = col('number') >= 0 && col('client') >= 0 ? 'invoices' : col('supplier') >= 0 ? 'expenses' : null;
  if (!kind) throw new Error('Columns not recognised. Download a template and keep its header row.');
  const get = (r, name) => { const i = col(name); return i >= 0 ? String(r[i] ?? '').trim() : ''; };
  const settings = settingsOf(data);
  const ops = [], skipped = [], errors = [];
  const result = { kind, ops, invoices: 0, expenses: 0, newClients: 0, skipped, errors };

  if (kind === 'invoices') {
    const groups = new Map();
    rows.slice(1).forEach((r, i) => {
      const number = get(r, 'Number');
      if (!number) { errors.push(`Row ${i + 2}: no invoice number.`); return; }
      if (!groups.has(number)) groups.set(number, []);
      groups.get(number).push({ r, row: i + 2 });
    });
    const existing = new Set(list(data.invoices).map(i => i.number));
    const created = [];   // clients added by this import
    for (const [number, items] of groups) {
      if (existing.has(number)) { skipped.push(`${number} (already in your accounts)`); continue; }
      try {
        const first = items[0].r;
        const issue = csvDate(get(first, 'Issue date'));
        if (!issue) throw new Error('no issue date');
        const name = get(first, 'Client');
        if (!name) throw new Error('no client');
        const party = { name, vat_number: normVat(get(first, 'Client VAT no')) };
        let client = matchClient(data, party) || matchClient({ clients: Object.fromEntries(created.map(c => [c.id, c])) }, party);
        if (!client) {
          const v = party.vat_number;
          client = { id: newId(), name, address: '', email: '', vat_number: v,
            country: !v || v.startsWith('MT') ? 'MT' : EU_PREFIX.test(v) ? 'EU' : 'NONEU', is_business: true, notes: '' };
          created.push(client);
          ops.push({ set: ['clients', client.id, client] });
          result.newClients++;
        }
        const fallback = malta.defaultVatTreatment(settings.vat_registration, client.country, !!client.is_business);
        const lines = items.map(({ r, row }) => {
          const description = get(r, 'Description') || 'Services';
          const q = Number(get(r, 'Qty').replace(',', '.') || 1);
          if (!isFinite(q) || q === 0) throw new Error(`row ${row}: quantity '${get(r, 'Qty')}' is not a number`);
          const unitText = get(r, 'Unit price');
          const unit = unitText ? toCents(unitText) : malta.roundHalfUp(toCents(get(r, 'Net') || get(r, 'Gross')) / q);
          const vt = csvVatTreatment(get(r, 'VAT treatment'), fallback);
          const [net, vat] = malta.lineAmounts(q, unit, vt);
          return { description, quantity: q, unit_price_cents: unit, vat_treatment: vt, net_cents: net, vat_cents: vat };
        });
        const paid = csvDate(get(first, 'Paid date'));
        let status = get(first, 'Status').toLowerCase();
        if (!INVOICE_STATUSES.includes(status)) status = paid ? 'paid' : 'sent';
        const due = csvDate(get(first, 'Due date')) || addDays(issue, Number(settings.payment_terms_days || 30));
        ops.push({ set: ['invoices', newId(), { number, client_id: client.id, issue_date: issue, due_date: due, status,
          paid_date: status === 'paid' ? (paid || due) : null, notes: '', lines, source_file: null }] });
        existing.add(number);
        result.invoices++;
      } catch (e) { errors.push(`${number} (row ${items[0].row}): ${e.message}`); }
    }
  } else {
    const seen = new Set(list(data.expenses).map(e => `${e.date}|${normName(e.supplier)}|${e.net_cents + e.vat_cents}`));
    rows.slice(1).forEach((r, i) => {
      const row = i + 2;
      try {
        const date = csvDate(get(r, 'Date'));
        if (!date) throw new Error('no date');
        const supplier = get(r, 'Supplier');
        if (!supplier) throw new Error('no supplier');
        const vat = toCents(get(r, 'VAT'));
        const gross = get(r, 'Gross') ? toCents(get(r, 'Gross')) : toCents(get(r, 'Net')) + vat;
        if (gross <= 0) throw new Error('no amount (fill in Gross)');
        if (vat > gross) throw new Error('VAT is more than the total');
        const pct = Number((get(r, 'Business %') || '100').replace('%', '').trim());
        if (!(Number.isInteger(pct) && pct > 0 && pct <= 100)) throw new Error('Business % must be 1–100');
        const key = `${date}|${normName(supplier)}|${gross}`;
        if (seen.has(key)) { skipped.push(`${supplier} ${date} (already recorded)`); return; }
        seen.add(key);
        const catText = get(r, 'Category').toLowerCase();
        const category = malta.EXPENSE_CATEGORIES.find(c => c.toLowerCase() === catText)
          || malta.EXPENSE_CATEGORIES.find(c => catText && c.toLowerCase().startsWith(catText)) || 'Other';
        const rec = get(r, 'VAT recoverable').toLowerCase();
        ops.push({ set: ['expenses', newId(), { date, supplier, description: get(r, 'Description'), category,
          net_cents: gross - vat, vat_cents: vat, business_pct: pct,
          vat_recoverable: rec ? ['yes', 'y', 'true', '1'].includes(rec) : settings.vat_registration === 'article10' && vat > 0,
          reference: get(r, 'Reference'), source_file: null }] });
        result.expenses++;
      } catch (e) { errors.push(`Row ${row}: ${e.message}`); }
    });
  }
  return result;
}

const EU_PREFIX = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|GR|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|NL|PL|PT|RO|SE|SI|SK)/;
