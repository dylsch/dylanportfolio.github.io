// Maltese tax, VAT and social security rules used by the app.
//
// Everything here is an *estimate* for planning purposes. Figures are for basis year 2026
// (year of assessment 2027) as published around Budget 2026. Rates are revised in every Budget,
// so check them each year against the MTCA (https://mtca.gov.mt) and update this file.
//
// Money is handled as integer cents throughout the app.

// Half-up rounding that ignores floating-point noise (e.g. 1500.4999999999 → 1501).
export function roundHalfUp(x) {
  const a = Number(Math.abs(x).toFixed(6));
  return Math.sign(x) * Math.round(a) || 0;
}

// ---------------------------------------------------------------- VAT (VAT Act, Cap. 406)

export const VAT_REGISTRATIONS = {
  article10: 'Article 10 – charges VAT, quarterly VAT returns',
  article11: 'Article 11 – small undertaking, VAT exempt, annual declaration',
  none: 'Not registered for VAT',
};

// Treatment applied to each invoice line. `rate` is a percentage.
export const VAT_TREATMENTS = {
  standard: { label: 'Standard rate 18%', rate: 18 },
  reduced7: { label: 'Reduced rate 7%', rate: 7 },
  reduced5: { label: 'Reduced rate 5%', rate: 5 },
  zero: { label: 'Zero-rated 0%', rate: 0 },
  exempt: {
    label: 'Exempt without credit (e.g. qualifying education)', rate: 0,
    note: 'Exempt without credit – Fifth Schedule, VAT Act (Cap. 406).',
  },
  reverse: {
    label: 'Reverse charge – EU business customer', rate: 0,
    note: 'Reverse charge – Article 196, Council Directive 2006/112/EC. VAT to be accounted for by the recipient.',
  },
  outside: {
    label: 'Outside the scope – non-EU business customer', rate: 0,
    note: 'Outside the scope of Maltese VAT – place of supply outside Malta.',
  },
  article11: {
    label: 'Article 11 – no VAT charged', rate: 0,
    note: 'VAT exempt – small undertaking registered under Article 11 of the VAT Act (Cap. 406).',
  },
};

// Article 11 small undertaking domestic turnover threshold (unified from 1 January 2025).
export const ARTICLE11_THRESHOLD = 35000;

export function defaultVatTreatment(registration, clientCountry, clientIsBusiness) {
  // B2B services abroad: the place of supply is the customer's country (an Article 11
  // registrant also needs an Article 12 number to invoice EU businesses under the reverse charge).
  if (clientIsBusiness && clientCountry === 'EU') return 'reverse';
  if (clientIsBusiness && clientCountry === 'NONEU') return 'outside';
  return registration === 'article10' ? 'standard' : 'article11';
}

// Net and VAT in cents for one invoice line.
export function lineAmounts(quantity, unitPriceCents, treatment) {
  const net = roundHalfUp(Number(quantity) * unitPriceCents);
  const vat = roundHalfUp(net * VAT_TREATMENTS[treatment].rate / 100);
  return [net, vat];
}

export const vatQuarter = isoDate => Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) + 1;

// ---------------------------------------------------------------- Income tax

// Each table: list of [upper bound of band in euro or null, rate %]. Basis year 2026.
export const TAX_TABLES = {
  single: { label: 'Single', bands: [[12000, 0], [16000, 15], [60000, 25], [null, 35]] },
  married: { label: 'Married (joint computation, no children)', bands: [[15000, 0], [23000, 15], [60000, 25], [null, 35]] },
  married_1child: { label: 'Married – one child', bands: [[17500, 0], [26500, 15], [60000, 25], [null, 35]] },
  parent: { label: 'Parent (no qualifying child for new bands)', bands: [[13000, 0], [17500, 15], [60000, 25], [null, 35]] },
  parent_1child: { label: 'Parent – one child', bands: [[14500, 0], [21000, 15], [60000, 25], [null, 35]] },
};
export const TAX_TABLES_YEAR = 2026;

// Part-time self-employment: a flat 10% final tax on the first €12,000 of net profit
// (full-time employed, pensioner or full-time student; activity registered with Jobsplus).
export const PART_TIME_RATE = 10;
export const PART_TIME_CAP = 12000;

// Progressive income tax (cents) on chargeable income (cents) for a tax status.
export function taxOn(incomeCents, status = 'single') {
  if (incomeCents <= 0) return 0;
  let tax = 0, lower = 0;
  for (const [upperEur, rate] of (TAX_TABLES[status] || TAX_TABLES.single).bands) {
    const upper = upperEur === null ? null : upperEur * 100;
    const top = upper === null ? incomeCents : Math.min(incomeCents, upper);
    if (top > lower) tax += (top - lower) * rate / 100;
    if (upper === null || incomeCents <= upper) break;
    lower = upper;
  }
  return roundHalfUp(tax);
}

// Compare normal rates with the part-time 10% regime. All amounts in cents.
// The tax on freelance work is the *extra* tax caused by the freelance profit, on top of the
// tax already withheld on employment income (FSS).
export function estimateTax(employmentCents, profitCents, status = 'single', partTimeEligible = true) {
  const emp = employmentCents;
  const profit = Math.max(profitCents, 0);
  const baseTax = taxOn(emp, status);
  const normalTotal = taxOn(emp + profit, status);
  const normalExtra = normalTotal - baseTax;
  const flatPart = Math.min(profit, PART_TIME_CAP * 100);
  const excess = profit - flatPart;
  const flatTax = roundHalfUp(flatPart * PART_TIME_RATE / 100);
  const excessTax = taxOn(emp + excess, status) - baseTax;
  const partTimeTotal = flatTax + excessTax;
  const best = partTimeEligible && partTimeTotal < normalExtra ? 'part_time' : 'normal';
  const bestTax = partTimeEligible ? Math.min(normalExtra, partTimeTotal) : normalExtra;
  return {
    employment: emp, profit, status,
    normalTotal, normalTaxOnFreelance: normalExtra,
    partTimeFlat: flatTax, partTimeExcessTax: excessTax, partTimeTaxOnFreelance: partTimeTotal,
    partTimeEligible, bestOption: best, bestTaxOnFreelance: bestTax,
    // Share of freelance profit to put aside for tax, as a percentage.
    setAsideRate: profit > 0 ? Math.round(bestTax / profit * 10000) / 100 : 0,
  };
}

// ---------------------------------------------------------------- Social security (Class 2)

// Self-occupied persons pay 15% of the previous year's net profit, up to a weekly maximum.
// People already paying Class 1 on full-time employment who use the part-time regime generally
// pay no extra Class 2 – confirm with the Department of Social Security.
export const CLASS2_RATE = 15;
export const CLASS2_WEEKLY_MAX = 83.89; // born on or after 1 January 1962
export const CLASS2_EXEMPT_BELOW = 910;  // annual income from economic activity

export function class2Estimate(profitCents) {
  if (profitCents <= CLASS2_EXEMPT_BELOW * 100) return 0;
  return roundHalfUp(Math.min(profitCents * CLASS2_RATE / 100, Math.round(CLASS2_WEEKLY_MAX * 100) * 52));
}

// ---------------------------------------------------------------- Compliance calendar

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Key filing and payment dates relating to basis year `year`, as [{date, label}].
export function deadlines(year, vatRegistration, partTime, paysClass2, provisionalTax) {
  const items = [];
  if (provisionalTax) items.push(
    { date: iso(year, 4, 30), label: `Provisional tax – 1st instalment (20%) for ${year}` },
    { date: iso(year, 8, 31), label: `Provisional tax – 2nd instalment (30%) for ${year}` },
    { date: iso(year, 12, 21), label: `Provisional tax – 3rd instalment (50%) for ${year}` });
  if (paysClass2) items.push(
    { date: iso(year, 4, 30), label: `Class 2 SSC – 1st instalment for ${year}` },
    { date: iso(year, 8, 31), label: `Class 2 SSC – 2nd instalment for ${year}` },
    { date: iso(year, 12, 21), label: `Class 2 SSC – 3rd instalment for ${year}` });
  if (partTime) items.push({ date: iso(year + 1, 4, 30), label: `Part-time self-employment 10% tax for ${year} – declare and pay` });
  items.push({ date: iso(year + 1, 6, 30), label: `Income tax return for ${year} (online filing usually gets an extension)` });
  if (vatRegistration === 'article10') {
    [[5, year], [8, year], [11, year], [2, year + 1]].forEach(([m, y], i) =>
      items.push({ date: iso(y, m, 15), label: `VAT return and payment – Q${i + 1} ${year}` }));
  } else if (vatRegistration === 'article11') {
    items.push({ date: iso(year + 1, 2, 15), label: `Article 11 VAT annual declaration for ${year}` });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------- Lists

export const EXPENSE_CATEGORIES = [
  'Computer & equipment',
  'Software & subscriptions',
  'Phone & internet',
  'Home office (business share of utilities)',
  'Books, courses & training',
  'Professional memberships',
  'Accountant & professional fees',
  'Travel (fuel, Bolt, Tallinja, Gozo ferry)',
  'Printing, stationery & postage',
  'Marketing & website',
  'Bank & payment fees',
  'Insurance',
  'Other',
];

export const COUNTRY_GROUPS = { MT: 'Malta', EU: 'Other EU country', NONEU: 'Outside the EU' };
