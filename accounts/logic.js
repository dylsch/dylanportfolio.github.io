// Bookkeeping logic shared by the pages: totals, the year summary, CSV exports and turning
// documents read by Claude into invoices and expenses. Pure functions over the store's data.
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(new Date(t + 'T12:00:00Z'))) return t;
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
