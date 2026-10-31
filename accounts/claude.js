// Read past invoices and receipts (PDF or image) with Claude, straight from the browser.
// Claude only extracts what is on the document; whether the result is safe to add without a
// human look is decided in logic.js (problems), by re-checking the arithmetic and required fields.
import * as malta from './malta.js';

export const MODEL = 'claude-opus-5-5';

export const MEDIA_TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const str = description => ({ type: 'string', description });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const SCHEMA = obj({
  document_type: { type: 'string', enum: ['sales_invoice', 'purchase', 'other'],
    description: 'sales_invoice if the account holder issued it to a client; purchase if it is a bill, invoice or fiscal receipt the account holder received from a supplier; other if neither' },
  number: str('Invoice or receipt number exactly as printed; empty if none'),
  issue_date: str('Date of issue as YYYY-MM-DD'),
  due_date: str('Due date as YYYY-MM-DD; empty if not shown'),
  paid: { type: 'boolean', description: "True if the document shows it was paid (receipt, 'PAID' stamp, card payment)" },
  paid_date: str('Payment date as YYYY-MM-DD if shown, else empty'),
  counterparty: { ...obj({
    name: { type: 'string' },
    address: str('Postal address, lines separated by newlines; empty if not shown'),
    email: str('Empty if not shown'),
    vat_number: str('VAT number including country prefix, e.g. MT12345678; empty if none'),
    country: { type: 'string', enum: ['MT', 'EU', 'NONEU'], description: 'MT if in Malta or Gozo, EU if another EU member state, NONEU otherwise' },
    is_business: { type: 'boolean', description: 'False only if clearly a private individual' },
  }), description: 'The client (for sales invoices) or the supplier (for purchases)' },
  currency: str('ISO currency code, e.g. EUR'),
  lines: { type: 'array', items: obj({
    description: { type: 'string' },
    quantity: { type: 'number' },
    unit_price: { type: 'number', description: 'Price per unit EXCLUDING VAT, in euro' },
    vat_treatment: { type: 'string', enum: Object.keys(malta.VAT_TREATMENTS) },
    line_net: { type: 'number', description: 'Line amount excluding VAT as printed (quantity x unit price)' },
  }) },
  total_net: { type: 'number', description: 'Total excluding VAT as printed' },
  total_vat: { type: 'number', description: 'Total VAT as printed (0 if none)' },
  total_gross: { type: 'number', description: 'Total payable as printed' },
  expense_category: str('For purchases: the best matching expense category; else empty'),
  notes: str('Purchase order numbers or other notes worth keeping; empty if none'),
  warnings: { type: 'array', items: { type: 'string' }, description: 'Anything unreadable, ambiguous or guessed, in plain English; empty if fully clear' },
});

const SYSTEM = (owner) => `You extract data from invoices and receipts for a personal accounting app used by a \
freelancer in Malta. Copy what is printed; never invent values. When something is illegible or \
missing, leave it empty (or 0) and say so in \`warnings\`.

The account holder is: ${owner || 'unknown (not set in Settings)'}.
- If the account holder issued the document, it is a \`sales_invoice\` and \`counterparty\` is the client.
- If the account holder received it from a supplier, it is a \`purchase\` and \`counterparty\` is the supplier.

VAT treatment per line (Malta, VAT Act Cap. 406):
- standard: 18% VAT charged
- reduced7 / reduced5: 7% or 5% VAT charged
- zero: zero-rated 0%
- exempt: exempt without credit (e.g. education, medical, insurance), no VAT
- reverse: reverse charge to an EU business customer, no VAT charged
- outside: outside the scope (e.g. services to non-EU business), no VAT charged
- article11: issuer is an Article 11 small undertaking, no VAT charged
If no VAT is shown and the document gives no reason, use article11 for Maltese issuers.

Use these expense categories for purchases: ${malta.EXPENSE_CATEGORIES.join('; ')}.
Dates must be YYYY-MM-DD; Maltese documents usually write dates as DD/MM/YYYY.`;

export class ExtractionError extends Error {}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Send one document to Claude and return the extracted fields.
export async function extract(blob, mediaType, owner, apiKey) {
  const data = await blobToBase64(blob);
  const block = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        // The key belongs to the signed-in owner and never leaves their browser except to Anthropic.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        fallbacks: 'default',
        system: SYSTEM(owner),
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract this document.' }] }],
      }),
    });
  } catch {
    throw new ExtractionError('Could not reach the Anthropic API. Check your internet connection.');
  }
  let body = null;
  try { body = await res.json(); } catch { /* handled below */ }
  if (!res.ok) {
    const msg = body?.error?.message || '';
    if (res.status === 401) throw new ExtractionError('The Anthropic API key was rejected. Check it on the Import page.');
    if (res.status === 429) throw new ExtractionError('Rate limited by the Anthropic API – try again in a minute.');
    if (res.status === 400 || res.status === 413) throw new ExtractionError(`Claude could not read this file: ${msg || res.statusText}`);
    throw new ExtractionError(`Anthropic API error (${res.status}) – try again later.`);
  }
  if (body?.stop_reason === 'refusal') throw new ExtractionError('Claude declined to process this document.');
  const text = (body?.content || []).filter(b => b.type === 'text').map(b => b.text).pop();
  if (body?.stop_reason === 'max_tokens' || !text) throw new ExtractionError("Claude's answer was incomplete – try again or enter this one by hand.");
  try { return JSON.parse(text); } catch { throw new ExtractionError("Claude's answer couldn't be read – try again."); }
}
