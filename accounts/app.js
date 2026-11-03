// Accounts (Malta): the pages. Runs entirely in the browser; `store` holds the data.
import * as malta from './malta.js';
import * as L from './logic.js';
import * as claude from './claude.js';
import * as drive from './drive.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = c => esc(L.eur(c));
const opts = (pairs, selected) => pairs.map(([v, label]) =>
  `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`).join('');
const fmtDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const qty = q => String(Number(q));
const NO_RATE = ['exempt', 'reverse', 'outside', 'article11'];

export function startApp(store, user, { signOut, drive: driveAccess } = {}) {
  const data = store.data;
  const main = document.getElementById('main');
  let flashes = [];
  let live = false;          // whether the current page re-renders when data changes
  let cleanup = [];          // object URLs etc. to release when leaving a page
  const flash = (msg, kind = 'ok') => flashes.push([kind, msg]);
  const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
  const S = () => L.settingsOf(data);

  // ---------------------------------------------------------------- Shell

  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="#/">🇲🇹 Accounts</a>
    <nav>${[['', 'Dashboard'], ['invoices', 'Invoices'], ['expenses', 'Expenses'], ['import', 'Import'],
      ['clients', 'Clients'], ['reports', 'Reports & tax'], ['settings', 'Settings']]
      .map(([p, t]) => `<a href="#/${p}" data-nav="${p}">${t}</a>`).join('')}</nav>
    <div class="user"><span title="Signed in with Google">${esc(user.email || '')}</span>${signOut ? '<button class="link" id="signOut">Sign out</button>' : ''}</div>`;
  document.getElementById('footer').textContent = `Estimates only, based on ${malta.TAX_TABLES_YEAR} Maltese rules. Confirm figures with the MTCA or your accountant before filing.`;
  if (signOut) document.getElementById('signOut').onclick = signOut;

  function route() {
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(query || '') };
  }
  const yearOf = q => Number(q.get('year')) || new Date().getFullYear();

  function yearPicker(year) {
    const cy = new Date().getFullYear();
    const years = [];
    for (let y = cy + 1; y > cy - 7; y--) years.push([y, y]);
    if (!years.some(([y]) => y === year)) years.push([year, year]);
    return `<label class="year-picker no-print">Year<select data-year>${opts(years, year)}</select></label>`;
  }

  function render() {
    cleanup.forEach(f => f()); cleanup = [];
    const { parts, q } = route();
    const section = parts[0] || '';
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === section));
    let page;
    try { page = pageFor(parts, q); } catch (e) { page = { html: `<div class="flash error">${esc(e.message)}</div>` }; }
    live = !!page.live;
    const t = page.title || 'Accounts';
    document.title = `${t} · ${S().trading_name || S().full_name || 'Accounts'}`;
    main.innerHTML = flashes.map(([k, m]) => `<div class="flash ${k} no-print">${esc(m)}</div>`).join('') + page.html;
    flashes = [];
    main.querySelectorAll('[data-year]').forEach(sel => sel.onchange = () => {
      q.set('year', sel.value); location.hash = `#/${parts.join('/')}?${q}`;
    });
    if (page.bind) page.bind();
    window.scrollTo(0, 0);
  }

  function pageFor(parts, q) {
    const [a, b, c] = parts;
    switch (a || '') {
      case '': return dashboard(yearOf(q));
      case 'settings': return settingsPage();
      case 'clients': return b ? clientForm(b === 'new' ? null : b) : clientsPage();
      case 'invoices':
        if (!b) return invoicesPage(yearOf(q));
        if (b === 'new') return invoiceForm(null, q.get('client'));
        if (c === 'edit') return invoiceForm(b);
        return invoiceView(b);
      case 'expenses': return b ? expenseForm(b === 'new' ? null : b) : expensesPage(yearOf(q));
      case 'import': return b ? importReview(b) : importPage();
      case 'reports': return reportsPage(yearOf(q));
      default: return { html: '<h1>Not found</h1><p><a href="#/">Back to the dashboard</a></p>' };
    }
  }

  // Re-render live pages when data changes elsewhere (another tab or device, or an import finishing).
  let pendingRender = null;
  store.subscribe(() => {
    if (!live) return;
    clearTimeout(pendingRender);
    pendingRender = setTimeout(() => {
      if (!live) return;   // navigated to a form meanwhile: never wipe what's being typed
      const y = window.scrollY; render(); window.scrollTo(0, y);
    }, 50);
  });
  window.addEventListener('hashchange', render);

  async function save(ops, okMsg, nextHash) {
    try {
      await store.commit(ops);
      if (okMsg) flash(okMsg);
      if (nextHash) go(nextHash); else render();
    } catch (e) {
      flash('Could not save: ' + e.message, 'error');
      render();
    }
  }

  function download(name, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function openFile(fileId, name = 'original') {
    const win = window.open('', '_blank');
    try {
      const blob = await store.getFile(fileId);
      if (blob.type === claude.DOCX) {   // browsers can't show Word files: download it instead
        if (win) win.close();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = /\.docx$/i.test(name) ? name : `${name}.docx`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url; else location.href = url;
    } catch (e) {
      if (win) win.close();
      alert(e.message);
    }
  }

  const formValues = form => {
    const fd = new FormData(form);
    return { get: k => (fd.get(k) ?? '').toString(), all: k => fd.getAll(k).map(String), has: k => fd.has(k) };
  };

  // ---------------------------------------------------------------- Dashboard

  function dashboard(year) {
    const s = L.yearSummary(data, year);
    const settings = S();
    const upcoming = L.upcomingDeadlines(settings, year);
    const e = s.estimate;
    let threshold = '';
    if (settings.vat_registration === 'article11') {
      const pct = s.threshold ? s.domesticTurnover / s.threshold * 100 : 0;
      threshold = `<section class="card"><h2>Article 11 VAT threshold</h2>
        <div class="meter ${pct >= 80 ? 'warn' : ''}"><div style="width:${Math.min(pct, 100)}%"></div></div>
        <p>${eur(s.domesticTurnover)} of ${eur(s.threshold)} domestic turnover in ${year} (${pct.toFixed(0)}%).
        ${pct >= 100 ? '<strong>You have exceeded the threshold – you must apply for Article 10 VAT registration.</strong>'
          : pct >= 80 ? '<strong>You are close to the threshold – talk to your accountant about Article 10 registration.</strong>' : ''}</p></section>`;
    }
    return { title: 'Dashboard', live: true, html: `
      <div class="page-head"><h1>Dashboard ${year}</h1>${yearPicker(year)}</div>
      ${!settings.full_name ? `<div class="callout">Start in <a href="#/settings">Settings</a>: add your name, address, ID card number,
        VAT registration and employment income so invoices and tax estimates are right.</div>` : ''}
      <section class="tiles">
        <div class="tile"><span>Income (excl. VAT)</span><strong>${eur(s.incomeNet)}</strong></div>
        <div class="tile"><span>Allowable expenses</span><strong>${eur(s.expenseTotal)}</strong></div>
        <div class="tile"><span>Net profit</span><strong>${eur(s.profit)}</strong></div>
        <div class="tile accent"><span>Put aside for tax</span><strong>${eur(e.bestTaxOnFreelance + s.class2)}</strong>
          <small>≈ ${e.setAsideRate.toFixed(2)}% of profit${s.class2 ? ' + Class 2 SSC' : ''}</small></div>
      </section>
      <div class="grid2">
        <section class="card"><h2>Unpaid invoices</h2>
          ${s.outstanding.length ? `<table><tr><th>Invoice</th><th>Client</th><th>Due</th><th class="num">Amount</th></tr>
            ${s.outstanding.map(i => `<tr class="${i.due_date < s.today ? 'overdue' : ''}">
              <td><a href="#/invoices/${esc(i.id)}">${esc(i.number)}</a></td><td>${esc(i.client_name)}</td>
              <td>${esc(i.due_date)}${i.due_date < s.today ? ' <span class="badge cancelled">overdue</span>' : ''}</td>
              <td class="num">${eur(i.gross)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing outstanding.</p>'}
          <p><a class="btn" href="#/invoices/new">+ New invoice</a> <a class="btn secondary" href="#/expenses/new">+ New expense</a></p>
        </section>
        <section class="card"><h2>Coming up (next 6 months)</h2>
          ${upcoming.length ? `<ul class="deadlines">${upcoming.map(d => `<li><time>${fmtDate(d.date)}</time> ${esc(d.label)}</li>`).join('')}</ul>`
            : '<p class="muted">No deadlines in the next six months.</p>'}
        </section>
      </div>${threshold}` };
  }

  // ---------------------------------------------------------------- Settings & backup

  function settingsPage() {
    const f = S();
    const inp = (name, label, extra = '') => `<label>${label}<input name="${name}" value="${esc(f[name])}" ${extra}></label>`;
    const check = (name, text) => `<label class="check wide"><input type="checkbox" name="${name}" ${f[name] === '1' ? 'checked' : ''}> ${text}</label>`;
    return { title: 'Settings', html: `
      <h1>Settings</h1>
      <form class="form" id="settingsForm">
        <fieldset><legend>You (shown on invoices)</legend>
          ${inp('full_name', 'Full name', 'required')}
          ${inp('trading_name', 'Trading name <small>(optional)</small>')}
          <label class="wide">Address<textarea name="address" rows="3" placeholder="Triq ir-Repubblika&#10;Valletta VLT 1117">${esc(f.address)}</textarea></label>
          ${inp('email', 'Email', 'type="email"')}
          ${inp('phone', 'Phone', 'placeholder="+356 ..."')}
          ${inp('id_card', 'ID card no. / TIN', 'placeholder="123456M"')}
          ${inp('vat_number', 'VAT number', 'placeholder="MT12345678"')}
        </fieldset>
        <fieldset><legend>VAT</legend>
          <label class="wide">VAT registration<select name="vat_registration">${opts(Object.entries(malta.VAT_REGISTRATIONS), f.vat_registration)}</select></label>
          <p class="hint wide">Most part-time freelancers start under <strong>Article 11</strong> (no VAT charged, turnover up to
            €${malta.ARTICLE11_THRESHOLD.toLocaleString('en-GB')}). If you supply services to businesses in other EU countries you
            also need an <strong>Article 12</strong> number for reverse-charge invoices.</p>
        </fieldset>
        <fieldset><legend>Income tax &amp; social security</legend>
          <label>Tax computation<select name="tax_status">${opts(Object.entries(malta.TAX_TABLES).map(([k, t]) => [k, t.label]), f.tax_status)}</select></label>
          <label>Expected employment income this year (€)<input name="employment_income" value="${esc(f.employment_income)}" inputmode="decimal">
            <small>Gross chargeable income from your job (FS3). Used to work out your marginal rate.</small></label>
          ${check('part_time_regime', `I qualify for the part-time self-employment regime (full-time employed, pensioner or full-time student;
            part-time activity registered with Jobsplus) – 10% flat on the first €${malta.PART_TIME_CAP.toLocaleString('en-GB')} of profit.`)}
          ${check('pays_class2', 'I pay Class 2 social security contributions on this income')}
          ${check('provisional_tax', 'I pay provisional tax (show April / August / December instalments)')}
        </fieldset>
        <fieldset><legend>Invoicing &amp; payment</legend>
          ${inp('invoice_prefix', 'Invoice prefix')}
          ${inp('payment_terms_days', 'Payment terms (days)', 'type="number" min="0"')}
          ${inp('bank_name', 'Bank', 'placeholder="Bank of Valletta / HSBC Malta / APS / Revolut"')}
          ${inp('iban', 'IBAN', 'placeholder="MT84 MALT 0110 0001 2345 MTLC AST0 01S"')}
          ${inp('bic', 'BIC / SWIFT')}
          <label class="wide">Invoice footer<textarea name="invoice_footer" rows="2">${esc(f.invoice_footer)}</textarea></label>
        </fieldset>
        <button class="btn">Save settings</button>
      </form>
      <section class="card mt-lg">
        <h2>Backup</h2>
        <p class="hint">Your accounts are stored in your private Firebase database. Maltese law requires records to be kept
          for at least 6 years, so download a backup now and then (original documents are not included).</p>
        <p><button class="btn secondary" id="backupBtn">Download backup (JSON)</button>
          <label class="btn secondary file-btn">Restore from backup…<input type="file" id="restoreFile" accept=".json,application/json" hidden></label></p>
      </section>`,
      bind() {
        document.getElementById('settingsForm').onsubmit = ev => {
          ev.preventDefault();
          const fv = formValues(ev.target);
          const values = {};
          for (const k of Object.keys(L.DEFAULT_SETTINGS)) values[k] = fv.get(k).trim();
          for (const k of ['part_time_regime', 'pays_class2', 'provisional_tax']) values[k] = fv.has(k) ? '1' : '0';
          try {
            values.employment_income = String(L.toCents(values.employment_income) / 100);
            if (values.payment_terms_days && !/^\d+$/.test(values.payment_terms_days)) throw new Error('Payment terms must be a whole number of days.');
          } catch (e) { flash(e.message, 'error'); render(); return; }
          save([{ settings: values }], 'Settings saved.', '#/settings');
        };
        document.getElementById('backupBtn').onclick = () => {
          const strip = o => Object.fromEntries(Object.entries(o).map(([id, v]) => [id, v]));
          download(`accounts-backup-${L.todayIso()}.json`, JSON.stringify({
            app: 'freelance-accounts-malta', version: 1, exported_at: new Date().toISOString(),
            settings: S(), clients: strip(data.clients), invoices: strip(data.invoices), expenses: strip(data.expenses),
          }, null, 2), 'application/json');
        };
        document.getElementById('restoreFile').onchange = async ev => {
          const file = ev.target.files[0];
          if (!file) return;
          let b;
          try {
            b = JSON.parse(await file.text());
            if (b.app !== 'freelance-accounts-malta') throw new Error('This is not an Accounts backup file.');
          } catch (e) { flash(e.message, 'error'); render(); return; }
          const counts = ['clients', 'invoices', 'expenses'].map(k => `${Object.keys(b[k] || {}).length} ${k}`).join(', ');
          if (!confirm(`Restore ${counts} and your settings? Records with the same id are overwritten; nothing else is deleted.`)) { ev.target.value = ''; return; }
          const ops = [{ settings: { ...L.DEFAULT_SETTINGS, ...(b.settings || {}) } }];
          for (const k of ['clients', 'invoices', 'expenses'])
            for (const [id, rec] of Object.entries(b[k] || {})) ops.push({ set: [k, id, rec] });
          save(ops, 'Backup restored.', '#/');
        };
      } };
  }

  // ---------------------------------------------------------------- Clients

  function clientsPage() {
    const billed = {};
    for (const i of L.list(data.invoices)) if (L.BILLED.includes(i.status))
      billed[i.client_id] = (billed[i.client_id] || 0) + L.invoiceTotals(i).net;
    const clients = L.list(data.clients).sort((a, b) => a.name.localeCompare(b.name));
    return { title: 'Clients', live: true, html: `
      <div class="page-head"><h1>Clients</h1><a class="btn" href="#/clients/new">+ New client</a></div>
      ${clients.length ? `<table class="card"><tr><th>Name</th><th>Where</th><th>VAT no.</th><th class="num">Billed to date</th><th></th></tr>
        ${clients.map(c => `<tr><td><a href="#/clients/${esc(c.id)}">${esc(c.name)}</a>${c.is_business ? '' : ' <span class="badge">individual</span>'}</td>
          <td>${esc(malta.COUNTRY_GROUPS[c.country] || c.country)}</td><td>${esc(c.vat_number)}</td>
          <td class="num">${eur(billed[c.id] || 0)}</td>
          <td class="actions"><a href="#/invoices/new?client=${esc(c.id)}">Invoice</a></td></tr>`).join('')}</table>`
        : '<p class="muted">No clients yet – e.g. a college, a company you consult for, or a student whose dissertation you supervise.</p>'}` };
  }

  function clientForm(id) {
    const c = id ? data.clients[id] : null;
    if (id && !c) throw new Error('That client no longer exists.');
    const v = c || { is_business: true, country: 'MT' };
    return { title: 'Client', html: `
      <h1>${c ? esc(c.name) : 'New client'}</h1>
      <form class="form" id="clientForm"><fieldset>
        <label>Name<input name="name" value="${esc(v.name)}" required></label>
        <label>Email<input name="email" type="email" value="${esc(v.email)}"></label>
        <label class="wide">Address<textarea name="address" rows="3">${esc(v.address)}</textarea></label>
        <label>Located in<select name="country">${opts(Object.entries(malta.COUNTRY_GROUPS), v.country)}</select></label>
        <label>VAT number<input name="vat_number" value="${esc(v.vat_number)}" placeholder="MT12345678 / DE123456789"></label>
        <label class="check wide"><input type="checkbox" name="is_business" ${v.is_business ? 'checked' : ''}> This client is a business (not a private individual)</label>
        <label class="wide">Notes<textarea name="notes" rows="2">${esc(v.notes)}</textarea></label>
      </fieldset>
      <button class="btn">Save</button> <a class="btn secondary" href="#/clients">Cancel</a></form>
      ${c ? '<button class="btn danger" id="delClient">Delete client</button>' : ''}`,
      bind() {
        document.getElementById('clientForm').onsubmit = ev => {
          ev.preventDefault();
          const f = formValues(ev.target);
          const rec = { name: f.get('name').trim(), address: f.get('address').trim(), email: f.get('email').trim(),
            vat_number: f.get('vat_number').trim().toUpperCase(), country: f.get('country') || 'MT',
            is_business: f.has('is_business'), notes: f.get('notes').trim() };
          if (!rec.name) { flash('Client name is required.', 'error'); render(); return; }
          save([{ set: ['clients', id || store.newId(), rec] }], 'Client saved.', '#/clients');
        };
        const del = document.getElementById('delClient');
        if (del) del.onclick = () => {
          if (L.list(data.invoices).some(i => i.client_id === id)) { flash('This client has invoices and cannot be deleted.', 'error'); go('#/clients'); return; }
          if (confirm('Delete this client?')) save([{ del: ['clients', id] }], 'Client deleted.', '#/clients');
        };
      } };
  }

  // ---------------------------------------------------------------- Invoices

  function invoicesPage(year) {
    const today = L.todayIso();
    const rows = L.list(data.invoices).filter(i => i.issue_date.startsWith(`${year}-`))
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.number.localeCompare(a.number));
    return { title: 'Invoices', live: true, html: `
      <div class="page-head"><h1>Invoices ${year}</h1>${yearPicker(year)}<a class="btn" href="#/invoices/new">+ New invoice</a></div>
      ${rows.length ? `<table class="card"><tr><th>Number</th><th>Date</th><th>Client</th><th>Status</th><th class="num">Net</th><th class="num">VAT</th><th class="num">Total</th></tr>
        ${rows.map(i => { const t = L.invoiceTotals(i); return `<tr>
          <td><a href="#/invoices/${esc(i.id)}">${esc(i.number)}</a></td><td>${esc(i.issue_date)}</td>
          <td>${esc(data.clients[i.client_id]?.name || '(deleted client)')}</td>
          <td><span class="badge ${esc(i.status)}">${esc(i.status)}</span>${i.status === 'sent' && i.due_date < today ? ' <span class="badge cancelled">overdue</span>' : ''}</td>
          <td class="num">${eur(t.net)}</td><td class="num">${eur(t.vat)}</td><td class="num">${eur(t.gross)}</td></tr>`; }).join('')}</table>
        <p><button class="link" id="csv">Download ${year} invoices as CSV</button></p>`
        : `<p class="muted">No invoices in ${year}.</p>`}`,
      bind() {
        const b = document.getElementById('csv');
        if (b) b.onclick = () => download(`invoices-${year}.csv`, L.invoicesCsv(data, year));
      } };
  }

  function invoiceForm(id, preselect) {
    const settings = S();
    const clients = L.list(data.clients).sort((a, b) => a.name.localeCompare(b.name));
    if (!clients.length) { flash('Add a client before creating an invoice.', 'error'); setTimeout(() => go('#/clients/new')); return { html: '' }; }
    const inv = id ? data.invoices[id] : null;
    if (id && !inv) throw new Error('That invoice no longer exists.');
    const today = L.todayIso();
    const terms = Number(settings.payment_terms_days || 30);
    const defaults = Object.fromEntries(clients.map(c => [c.id, malta.defaultVatTreatment(settings.vat_registration, c.country, !!c.is_business)]));
    const selected = inv ? inv.client_id : (preselect && data.clients[preselect] ? preselect : clients[0].id);
    const treatments = Object.entries(malta.VAT_TREATMENTS).map(([k, t]) => [k, t.label]);
    const lineRow = l => `<tr>
      <td><input name="description" value="${esc(l?.description)}" placeholder="e.g. Dissertation supervision – 6 sessions"></td>
      <td><input name="quantity" value="${l ? qty(l.quantity) : 1}" inputmode="decimal" class="short"></td>
      <td><input name="unit_price" value="${l ? L.plain(l.unit_price_cents) : ''}" inputmode="decimal" class="short"></td>
      <td><select name="vat_treatment" class="vat">${opts(treatments, l ? l.vat_treatment : defaults[selected])}</select></td>
      <td><button type="button" class="link remove" title="Remove line">✕</button></td></tr>`;
    return { title: 'Invoice', html: `
      <h1>${inv ? 'Edit ' + esc(inv.number) : 'New invoice'}</h1>
      <form class="form" id="invoiceForm">
        <fieldset>
          <label>Client<select name="client_id" id="client">${opts(clients.map(c => [c.id, c.name]), selected)}</select></label>
          <label>Invoice number<input name="number" value="${esc(inv ? inv.number : L.nextInvoiceNumber(data, Number(today.slice(0, 4))))}">
            <small>Must be unique and sequential.</small></label>
          <label>Issue date<input type="date" name="issue_date" value="${esc(inv ? inv.issue_date : today)}" required></label>
          <label>Due date<input type="date" name="due_date" value="${esc(inv ? inv.due_date : L.addDays(today, terms))}"></label>
        </fieldset>
        <table class="lines"><thead><tr><th>Description</th><th>Qty / hours</th><th>Unit price (€, excl. VAT)</th><th>VAT</th><th></th></tr></thead>
          <tbody id="lines">${(inv?.lines?.length ? inv.lines : [null]).map(lineRow).join('')}</tbody></table>
        <p><button type="button" class="btn secondary" id="addLine">+ Add line</button></p>
        <label class="wide">Notes on invoice<textarea name="notes" rows="2" placeholder="e.g. Purchase order no., academic year">${esc(inv?.notes)}</textarea></label>
        <p class="hint">Each line defaults to the usual VAT treatment for the client and your VAT registration. Tuition and
          supervision for recognised courses is often <em>exempt without credit</em> – check with your accountant.</p>
        <button class="btn">Save invoice</button>
        <a class="btn secondary" href="${inv ? `#/invoices/${esc(id)}` : '#/invoices'}">Cancel</a>
      </form>`,
      bind() {
        const tbody = document.getElementById('lines');
        const client = document.getElementById('client');
        const applyDefault = row => row.querySelector('.vat').value = defaults[client.value];
        document.getElementById('addLine').onclick = () => {
          const row = tbody.rows[0].cloneNode(true);
          row.querySelectorAll('input').forEach(i => i.value = i.name === 'quantity' ? '1' : '');
          applyDefault(row);
          tbody.appendChild(row);
        };
        tbody.onclick = e => { if (e.target.classList.contains('remove') && tbody.rows.length > 1) e.target.closest('tr').remove(); };
        client.onchange = () => Array.from(tbody.rows).forEach(applyDefault);
        const issueInput = document.querySelector('[name=issue_date]');
        const numberInput = document.querySelector('[name=number]');
        if (!inv) issueInput.onchange = () => {   // keep the suggested number in the issue year's sequence
          const y = issueInput.value.slice(0, 4);
          if (/^\d{4}$/.test(y) && numberInput.value === L.nextInvoiceNumber(data, Number(today.slice(0, 4))))
            numberInput.value = L.nextInvoiceNumber(data, Number(y));
        };
        document.getElementById('invoiceForm').onsubmit = ev => {
          ev.preventDefault();
          const f = formValues(ev.target);
          let rec;
          try {
            const issue = L.parseDate(f.get('issue_date'));
            const due = L.parseDate(f.get('due_date'), L.addDays(issue, terms));
            const descs = f.all('description'), qtys = f.all('quantity'), prices = f.all('unit_price'), vats = f.all('vat_treatment');
            const lines = [];
            descs.forEach((d, i) => {
              if (!d.trim()) return;
              if (!malta.VAT_TREATMENTS[vats[i]]) throw new Error('Unknown VAT treatment');
              const q = Number(qtys[i] || 1);
              if (!isFinite(q)) throw new Error(`'${qtys[i]}' is not a valid quantity`);
              const unit = L.toCents(prices[i]);
              const [net, vat] = malta.lineAmounts(q, unit, vats[i]);
              lines.push({ description: d.trim(), quantity: q, unit_price_cents: unit, vat_treatment: vats[i], net_cents: net, vat_cents: vat });
            });
            if (!lines.length) throw new Error('Add at least one line with a description.');
            const number = f.get('number').trim() || L.nextInvoiceNumber(data, Number(issue.slice(0, 4)));
            if (L.list(data.invoices).some(i => i.number === number && i.id !== id)) throw new Error(`Invoice number ${number} is already used.`);
            rec = { ...(inv || { status: 'draft', paid_date: null, source_file: null }),
              number, client_id: f.get('client_id'), issue_date: issue, due_date: due, notes: f.get('notes'), lines };
          } catch (e) { main.insertAdjacentHTML('afterbegin', `<div class="flash error">${esc(e.message)}</div>`); window.scrollTo(0, 0); return; }
          const newId = id || store.newId();
          save([{ set: ['invoices', newId, rec] }], `Invoice ${rec.number} saved.`, `#/invoices/${newId}`);
        };
      } };
  }

  function invoiceView(id) {
    const inv = data.invoices[id];
    if (!inv) throw new Error('That invoice no longer exists.');
    const settings = S();
    const client = data.clients[inv.client_id] || { name: '(deleted client)' };
    const totals = L.invoiceTotals(inv);
    const breakdown = {};
    for (const l of inv.lines || []) {
      const r = breakdown[l.vat_treatment] ||= { net: 0, vat: 0 };
      r.net += l.net_cents; r.vat += l.vat_cents;
    }
    const notes = [...new Set(Object.keys(breakdown).map(t => malta.VAT_TREATMENTS[t]?.note).filter(Boolean))].sort();
    const br = s => esc(s).replace(/\n/g, '<br>');
    return { title: inv.number, live: true, html: `
      <div class="toolbar no-print">
        <a class="btn secondary" href="#/invoices?year=${esc(inv.issue_date.slice(0, 4))}">← Invoices</a>
        <button class="btn" onclick="window.print()">Print / save as PDF</button>
        <a class="btn secondary" href="#/invoices/${esc(id)}/edit">Edit</a>
        ${inv.source_file ? '<button class="btn secondary" id="origDoc">Original document</button>' : ''}
        <form class="inline" id="statusForm">
          <select name="status">${opts(L.INVOICE_STATUSES.map(s => [s, s]), inv.status)}</select>
          <input type="date" name="paid_date" value="${esc(inv.paid_date || '')}" title="Date paid (when marking paid)">
          <button class="btn secondary">Update status</button>
        </form>
        ${inv.status === 'draft' ? '<button class="btn danger inline-danger" id="delDraft">Delete draft</button>' : ''}
      </div>
      <article class="invoice">
        <header>
          <div><h1>${settings.vat_registration === 'article10' ? 'VAT Invoice' : 'Invoice'}</h1>
            <p class="status-line no-print"><span class="badge ${esc(inv.status)}">${esc(inv.status)}</span>${inv.paid_date ? ' paid ' + esc(inv.paid_date) : ''}</p></div>
          <div class="from">
            <strong>${esc(settings.trading_name || settings.full_name)}</strong><br>
            ${settings.trading_name ? esc(settings.full_name) + '<br>' : ''}
            ${esc(settings.address.replace(/\n/g, ', '))}<br>
            ${settings.email ? esc(settings.email) + '<br>' : ''}
            ${settings.phone ? esc(settings.phone) + '<br>' : ''}
            ${settings.vat_number ? 'VAT no.: ' + esc(settings.vat_number) + '<br>' : ''}
            ${settings.id_card ? 'ID / TIN: ' + esc(settings.id_card) : ''}
          </div>
        </header>
        <section class="meta">
          <div><h3>Bill to</h3><strong>${esc(client.name)}</strong><br>${br(client.address)}
            ${client.vat_number ? '<br>VAT no.: ' + esc(client.vat_number) : ''}</div>
          <dl><dt>Invoice no.</dt><dd>${esc(inv.number)}</dd><dt>Date of issue</dt><dd>${esc(inv.issue_date)}</dd><dt>Due date</dt><dd>${esc(inv.due_date)}</dd></dl>
        </section>
        <table class="items">
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">VAT</th><th class="num">Amount</th></tr></thead>
          <tbody>${(inv.lines || []).map(l => `<tr><td>${esc(l.description)}</td><td class="num">${qty(l.quantity)}</td>
            <td class="num">${eur(l.unit_price_cents)}</td>
            <td class="num">${NO_RATE.includes(l.vat_treatment) ? '–' : malta.VAT_TREATMENTS[l.vat_treatment].rate + '%'}</td>
            <td class="num">${eur(l.net_cents)}</td></tr>`).join('')}</tbody>
          <tfoot>
            <tr><td colspan="4">Total excl. VAT</td><td class="num">${eur(totals.net)}</td></tr>
            ${Object.entries(breakdown).filter(([, r]) => r.vat).map(([t, r]) =>
              `<tr><td colspan="4">VAT ${malta.VAT_TREATMENTS[t].rate}% on ${eur(r.net)}</td><td class="num">${eur(r.vat)}</td></tr>`).join('')}
            <tr class="grand"><td colspan="4">Total due</td><td class="num">${eur(totals.gross)}</td></tr>
          </tfoot>
        </table>
        ${notes.map(n => `<p class="vat-note">${esc(n)}</p>`).join('')}
        ${inv.notes ? `<p>${br(inv.notes)}</p>` : ''}
        ${settings.iban ? `<section class="pay"><h3>Payment details</h3>
          ${settings.bank_name ? 'Bank: ' + esc(settings.bank_name) + '<br>' : ''}Account name: ${esc(settings.full_name)}<br>
          IBAN: ${esc(settings.iban)}${settings.bic ? '<br>BIC: ' + esc(settings.bic) : ''}<br>Reference: ${esc(inv.number)}</section>` : ''}
        ${settings.invoice_footer ? `<p class="footer-note">${esc(settings.invoice_footer)}</p>` : ''}
      </article>`,
      bind() {
        const orig = document.getElementById('origDoc');
        if (orig) orig.onclick = () => openFile(inv.source_file);
        document.getElementById('statusForm').onsubmit = ev => {
          ev.preventDefault();
          const f = formValues(ev.target);
          const status = f.get('status');
          const paid = status === 'paid' ? L.parseDate(f.get('paid_date'), L.todayIso()) : null;
          save([{ set: ['invoices', id, { ...inv, status, paid_date: paid }] }], `Invoice marked as ${status}.`);
        };
        const del = document.getElementById('delDraft');
        if (del) del.onclick = () => {
          if (confirm('Delete this draft?')) save([{ del: ['invoices', id] }], 'Draft deleted.', '#/invoices');
        };
      } };
  }

  // ---------------------------------------------------------------- Expenses

  function expensesPage(year) {
    const rows = L.list(data.expenses).filter(e => e.date.startsWith(`${year}-`)).sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.reduce((s, e) => s + L.expenseCost(e), 0);
    return { title: 'Expenses', live: true, html: `
      <div class="page-head"><h1>Expenses ${year}</h1>${yearPicker(year)}<a class="btn" href="#/expenses/new">+ New expense</a></div>
      ${rows.length ? `<table class="card"><tr><th>Date</th><th>Supplier</th><th>Category</th><th class="num">Paid</th><th class="num">Business %</th><th class="num">Allowable</th><th></th></tr>
        ${rows.map(e => `<tr><td>${esc(e.date)}</td>
          <td><a href="#/expenses/${esc(e.id)}">${esc(e.supplier)}</a>${e.description ? `<br><small class="muted">${esc(e.description)}</small>` : ''}</td>
          <td>${esc(e.category)}</td><td class="num">${eur(e.net_cents + e.vat_cents)}</td><td class="num">${e.business_pct}%</td>
          <td class="num">${eur(L.expenseCost(e))}</td>
          <td class="actions"><button class="link" data-del="${esc(e.id)}">Delete</button></td></tr>`).join('')}
        <tr class="total"><td colspan="5">Total allowable</td><td class="num">${eur(total)}</td><td></td></tr></table>
        <p><button class="link" id="csv">Download ${year} expenses as CSV</button></p>`
        : `<p class="muted">No expenses recorded for ${year}.</p>`}`,
      bind() {
        const b = document.getElementById('csv');
        if (b) b.onclick = () => download(`expenses-${year}.csv`, L.expensesCsv(data, year));
        main.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
          if (confirm('Delete this expense?')) save([{ del: ['expenses', btn.dataset.del] }], 'Expense deleted.');
        });
      } };
  }

  function expenseForm(id) {
    const e = id ? data.expenses[id] : null;
    if (id && !e) throw new Error('That expense no longer exists.');
    const settings = S();
    return { title: 'Expense', html: `
      <h1>${e ? 'Edit expense' : 'New expense'}</h1>
      <form class="form" id="expenseForm"><fieldset>
        <label>Date<input type="date" name="date" value="${esc(e ? e.date : L.todayIso())}" required></label>
        <label>Supplier<input name="supplier" value="${esc(e?.supplier)}" required placeholder="e.g. Scan, GO, Epic, Melita"></label>
        <label>Category<select name="category">${opts(malta.EXPENSE_CATEGORIES.map(c => [c, c]), e?.category)}</select></label>
        <label>Description<input name="description" value="${esc(e?.description)}"></label>
        <label>Total paid incl. VAT (€)<input name="gross" value="${e ? L.plain(e.net_cents + e.vat_cents) : ''}" inputmode="decimal" required></label>
        <label>VAT included (€)<input name="vat" value="${e ? L.plain(e.vat_cents) : ''}" inputmode="decimal" placeholder="from the fiscal receipt"></label>
        <label>Business use %<input name="business_pct" type="number" min="1" max="100" value="${e ? e.business_pct : 100}">
          <small>e.g. 50% of a phone bill you also use privately.</small></label>
        <label>Receipt / invoice ref.<input name="reference" value="${esc(e?.reference)}"></label>
        <label class="check wide"><input type="checkbox" name="vat_recoverable" ${(e ? e.vat_recoverable : settings.vat_registration === 'article10') ? 'checked' : ''}>
          I can reclaim this VAT (Article 10 registered and the expense relates to taxable supplies)</label>
      </fieldset>
      ${e?.source_file ? '<p><button type="button" class="link" id="origDoc">View original receipt</button></p>' : ''}
      <p class="hint">Keep the fiscal receipt or VAT invoice – records must be kept for at least 6 years.</p>
      <button class="btn">Save</button> <a class="btn secondary" href="#/expenses">Cancel</a></form>`,
      bind() {
        const orig = document.getElementById('origDoc');
        if (orig) orig.onclick = () => openFile(e.source_file);
        document.getElementById('expenseForm').onsubmit = ev => {
          ev.preventDefault();
          const f = formValues(ev.target);
          let rec;
          try {
            const date = L.parseDate(f.get('date'));
            const gross = L.toCents(f.get('gross'));
            const vat = L.toCents(f.get('vat'));
            if (vat > gross) throw new Error('VAT cannot be more than the total paid.');
            const pct = Number(f.get('business_pct') || 100);
            if (!(Number.isInteger(pct) && pct > 0 && pct <= 100)) throw new Error('Business use must be between 1 and 100%.');
            if (!f.get('supplier').trim()) throw new Error('Supplier is required.');
            rec = { ...(e || { source_file: null }), date, supplier: f.get('supplier').trim(), description: f.get('description').trim(),
              category: f.get('category') || 'Other', net_cents: gross - vat, vat_cents: vat, business_pct: pct,
              vat_recoverable: f.has('vat_recoverable'), reference: f.get('reference').trim() };
          } catch (err) { main.insertAdjacentHTML('afterbegin', `<div class="flash error">${esc(err.message)}</div>`); window.scrollTo(0, 0); return; }
          save([{ set: ['expenses', id || store.newId(), rec] }], 'Expense saved.', `#/expenses?year=${rec.date.slice(0, 4)}`);
        };
      } };
  }

  // ---------------------------------------------------------------- Import with Claude

  let apiKey = null;          // loaded on first visit to the Import page
  const running = new Set();  // import ids being read in this tab
  const queue = [];
  const blobs = new Map();    // import id → uploaded file, so it isn't downloaded again
  const STALE_MS = 10 * 60 * 1000;
  let driveStatus = '';       // progress message while files come in from Google Drive

  // Store each file, record an import and queue it for Claude. items: [{ blob, name, type, drive_id? }]
  async function addDocuments(items, autoAdd) {
    const skipped = [];
    let queued = 0;
    for (const it of items) {
      try {
        const fileId = await store.putFile(it.blob, it.name);
        const id = store.newId();
        const stamp = new Date().toISOString();
        await store.commit([{ set: ['imports', id, { filename: it.name, file_id: fileId, media_type: it.type, auto_add: autoAdd,
          source: it.drive_id ? 'drive' : 'upload', drive_id: it.drive_id || null,
          status: 'processing', problems: [], error: '', created_at: stamp, started_at: stamp }] }]);
        blobs.set(id, it.blob);
        queue.push(id); queued++;
      } catch (e) { skipped.push(`${it.name} (${e.message})`); }
    }
    pump();
    return { queued, skipped };
  }

  async function importFromDrive(autoAdd) {
    let token;
    try { token = await driveAccess.getToken(); } catch (e) { flash(e.message, 'error'); render(); return; }
    if (!token) return;   // Google window closed
    let picked;
    try { picked = await drive.pickFiles(token, driveAccess); } catch (e) { flash(e.message, 'error'); render(); return; }
    if (!picked.length) return;
    const already = new Set(L.list(data.imports).filter(r => r.drive_id && r.status !== 'discarded').map(r => r.drive_id));
    const skipped = [], items = [];
    let n = 0;
    for (const f of picked) {
      n++;
      if (already.has(f.id)) { skipped.push(`${f.name} (already imported)`); continue; }
      if (f.size > claude.MAX_FILE_BYTES) { skipped.push(`${f.name} (over 20 MB)`); continue; }
      driveStatus = `Getting ${n} of ${picked.length} from Google Drive…`; render();
      try {
        const file = await drive.downloadFile(token, f);
        if (file.blob.size > claude.MAX_FILE_BYTES) { skipped.push(`${f.name} (over 20 MB)`); continue; }
        items.push({ ...file, drive_id: f.id });
      } catch (e) { skipped.push(`${f.name} (${e.message})`); }
    }
    driveStatus = items.length ? 'Saving…' : ''; render();
    const res = await addDocuments(items, autoAdd);
    driveStatus = '';
    skipped.push(...res.skipped);
    if (skipped.length) flash(`Skipped: ${skipped.join(', ')}.`, 'error');
    if (res.queued) flash(`Claude is reading ${res.queued} document(s) from Google Drive. This page updates by itself.`);
    render();
  }

  function ownerDescription() {
    const s = S();
    return [s.full_name, s.trading_name, s.vat_number, s.id_card].filter(Boolean).join(', ');
  }

  function pump() {
    while (running.size < 3 && queue.length) {
      const id = queue.shift();
      running.add(id);
      processImport(id).finally(() => { running.delete(id); blobs.delete(id); pump(); });
    }
  }

  async function processImport(id) {
    const row = data.imports[id];
    if (!row) return;
    const fail = msg => store.commit([{ set: ['imports', id, { ...data.imports[id], status: 'failed', error: msg }] }]).catch(() => {});
    try {
      if (!apiKey) throw new claude.ExtractionError('Add your Anthropic API key on the Import page first.');
      const blob = blobs.get(id) || await store.getFile(row.file_id);
      const doc = await claude.extract(blob, row.media_type, ownerDescription(), apiKey);
      const issues = L.problems(doc);
      const dup = L.duplicateOf(data, doc);
      if (dup) issues.push(dup);
      const current = { ...data.imports[id], doc, problems: issues };
      if (current.auto_add && !issues.length) await store.commit(L.documentOps(data, current, doc, store.newId));
      else await store.commit([{ set: ['imports', id, { ...current, status: 'review' }] }]);
    } catch (e) {
      await fail(e instanceof claude.ExtractionError ? e.message : `Unexpected error: ${e.message}`);
    }
  }

  function importPage() {
    const now = Date.now();
    const stale = L.list(data.imports).filter(r => r.status === 'processing' && !running.has(r.id) && now - Date.parse(r.started_at || 0) > STALE_MS);
    if (stale.length) store.commit(stale.map(r => ({ set: ['imports', r.id, { ...r, status: 'failed', error: 'Interrupted – please retry.' }] })));
    if (apiKey === null) store.getApiKey().then(k => { apiKey = k; if (route().parts[0] === 'import' && !route().parts[1]) render(); }).catch(() => { apiKey = ''; });
    const rows = L.list(data.imports).filter(r => r.status !== 'discarded')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 200);
    const badge = r => r.status === 'processing' ? '<span class="badge sent">reading…</span>'
      : r.status === 'review' ? '<span class="badge cancelled">needs review</span>'
      : r.status === 'imported' ? '<span class="badge paid">added</span>' : '<span class="badge cancelled">failed</span>';
    const keyBox = apiKey === null ? '<p class="muted">Loading…</p>' : apiKey
      ? `<p>Anthropic API key saved (ends in <code>${esc(apiKey.slice(-4))}</code>). <button class="link" id="changeKey">Change</button> · <button class="link" id="removeKey">Remove</button></p>`
      : `<div class="callout">Claude needs an Anthropic API key to read documents. Create one at
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a> and paste it here.
          It is stored in your private database, readable only when you're signed in.</div>
        <form class="inline" id="keyForm"><input name="key" type="password" placeholder="sk-ant-..." autocomplete="off" required style="min-width:18rem"><button class="btn">Save key</button></form>`;
    return { title: 'Import', live: true, html: `
      <h1>Import past invoices &amp; receipts</h1>
      <section class="card">${keyBox}</section>
      <form class="card upload" id="uploadForm">
        <label class="drop"><input type="file" name="files" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif">
          <span>Choose PDFs, Word documents (.docx) or photos – your own invoices to clients, or bills and receipts from suppliers. You can select many at once.</span></label>
        <label class="check"><input type="checkbox" name="auto_add" checked>
          Add straight to my accounts when everything checks out. Anything unclear, duplicated or not adding up waits for you to review.</label>
        <div class="row-buttons">
          <button class="btn" ${apiKey ? '' : 'disabled'}>Upload and let Claude read them</button>
          ${driveAccess ? `<button type="button" class="btn secondary" id="driveBtn" ${apiKey && !driveStatus ? '' : 'disabled'}>
            <svg viewBox="0 0 87.3 78" aria-hidden="true"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"/><path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"/><path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>
            Choose from Google Drive</button>` : ''}
        </div>
        ${driveStatus ? `<p class="muted">${esc(driveStatus)}</p>` : ''}
        <p class="hint">Claude works out whether each document is an invoice you issued (added as an invoice, with the client
          created if new) or a purchase (added as an expense). Amounts are re-checked line by line before anything is saved.
          From Google Drive you can pick PDFs, Word documents and Google Docs; the app can only read the files you pick.
          Files are sent to Anthropic for processing and the originals are kept in your private database.
          Keep this page open while documents are being read.</p>
      </form>
      ${rows.length ? `<table class="card"><tr><th>Document</th><th>Status</th><th>What Claude found</th><th></th></tr>
        ${rows.map(r => `<tr>
          <td><button class="link" data-open="${esc(r.file_id)}" data-name="${esc(r.filename)}">${esc(r.filename)}</button>${r.source === 'drive' ? '<br><small class="muted">from Google Drive</small>' : ''}</td><td>${badge(r)}</td>
          <td>${r.doc ? `${r.doc.document_type === 'sales_invoice' ? 'Your invoice' : r.doc.document_type === 'purchase' ? 'Purchase' : 'Not an invoice'}
            ${esc(r.doc.number || '')} · ${esc(r.doc.counterparty?.name)} · ${esc(r.doc.issue_date)} · ${eur(Math.round(Number(r.doc.total_gross || 0) * 100))}
            ${r.status === 'review' ? `<ul class="problems">${(r.problems || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}`
            : r.error ? `<span class="muted">${esc(r.error)}</span>` : ''}</td>
          <td class="actions">
            ${r.status === 'review' ? `<a class="btn" href="#/import/${esc(r.id)}">Review</a>`
              : r.status === 'imported' ? `<a href="${r.record_type === 'invoice' ? '#/invoices/' : '#/expenses/'}${esc(r.record_id)}">Open ${esc(r.record_type)}</a>`
              : r.status === 'failed' ? `<button class="link" data-retry="${esc(r.id)}">Retry</button>` : ''}
            ${['review', 'failed'].includes(r.status) ? ` <button class="link" data-discard="${esc(r.id)}">Discard</button>` : ''}
          </td></tr>`).join('')}</table>` : ''}`,
      bind() {
        const keyForm = document.getElementById('keyForm');
        if (keyForm) keyForm.onsubmit = async ev => {
          ev.preventDefault();
          const k = formValues(ev.target).get('key').trim();
          if (!k.startsWith('sk-ant-')) { alert('That does not look like an Anthropic API key (they start with sk-ant-).'); return; }
          try { await store.setApiKey(k); apiKey = k; flash('API key saved.'); } catch (e) { flash('Could not save the key: ' + e.message, 'error'); }
          render();
        };
        const change = document.getElementById('changeKey');
        if (change) change.onclick = () => { apiKey = ''; render(); };
        const remove = document.getElementById('removeKey');
        if (remove) remove.onclick = async () => {
          if (!confirm('Remove the saved API key?')) return;
          await store.setApiKey(''); apiKey = ''; flash('API key removed.'); render();
        };
        document.getElementById('uploadForm').onsubmit = async ev => {
          ev.preventDefault();
          const f = new FormData(ev.target);
          const files = f.getAll('files').filter(x => x && x.name);
          if (!files.length) { alert('Choose at least one file first.'); return; }
          const btn = ev.target.querySelector('button');
          btn.disabled = true; btn.textContent = 'Uploading…';
          const items = [], bad = [];
          for (const file of files) {
            const type = claude.MEDIA_TYPES[file.name.split('.').pop().toLowerCase()];
            if (!type || file.size > claude.MAX_FILE_BYTES) { bad.push(file.name); continue; }
            items.push({ blob: file.type === type ? file : new Blob([file], { type }), name: file.name, type });
          }
          const { queued, skipped } = await addDocuments(items, f.has('auto_add'));
          if (bad.length) flash(`Skipped: ${bad.join(', ')}. Use PDF, Word (.docx), PNG, JPG, WEBP or GIF files up to 20 MB.`, 'error');
          if (skipped.length) flash(`Skipped: ${skipped.join(', ')}.`, 'error');
          if (queued) flash(`Claude is reading ${queued} document(s). This page updates by itself.`);
          render();
        };
        main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openFile(b.dataset.open, b.dataset.name));
        const driveBtn = document.getElementById('driveBtn');
        if (driveBtn) driveBtn.onclick = () => importFromDrive(document.querySelector('#uploadForm [name=auto_add]').checked);
        main.querySelectorAll('[data-retry]').forEach(b => b.onclick = async () => {
          const r = data.imports[b.dataset.retry];
          await store.commit([{ set: ['imports', r.id, { ...r, status: 'processing', error: '', started_at: new Date().toISOString() }] }]);
          queue.push(r.id); pump();
        });
        main.querySelectorAll('[data-discard]').forEach(b => b.onclick = () => discard(b.dataset.discard));
      } };
  }

  async function discard(id) {
    const r = data.imports[id];
    if (!r || r.status === 'imported' || !confirm('Discard this document?')) return;
    await save([{ set: ['imports', id, { ...r, status: 'discarded' }] }], 'Document discarded.', '#/import');
    if (r.file_id) store.deleteFile(r.file_id).catch(() => {});
  }

  // Apply the corrections from the review form to an extracted document.
  function reviewFormToDoc(f, doc) {
    doc = structuredClone(doc);
    doc.document_type = f.get('document_type');
    if (!['sales_invoice', 'purchase'].includes(doc.document_type)) throw new Error('Choose whether this is your invoice or a purchase.');
    doc.number = f.get('number').trim();
    doc.issue_date = L.parseDate(f.get('issue_date'));
    doc.due_date = f.get('due_date') ? L.parseDate(f.get('due_date'), '') : '';
    doc.paid = f.has('paid');
    doc.paid_date = f.get('paid_date') ? L.parseDate(f.get('paid_date'), '') : '';
    doc.notes = f.get('notes').trim();
    doc.counterparty = { name: f.get('party_name').trim(), address: f.get('party_address').trim(), email: f.get('party_email').trim(),
      vat_number: f.get('party_vat').trim(), country: f.get('party_country') || 'MT', is_business: f.has('party_business') };
    let clientId = null;
    if (doc.document_type === 'sales_invoice') {
      if (!doc.number) throw new Error('An invoice number is required.');
      if (f.get('client_id') !== 'new') clientId = f.get('client_id');
      else if (!doc.counterparty.name) throw new Error("Enter the client's name.");
      const descs = f.all('description'), qtys = f.all('quantity'), prices = f.all('unit_price'), vats = f.all('vat_treatment');
      const lines = [];
      descs.forEach((d, i) => {
        if (!d.trim()) return;
        if (!malta.VAT_TREATMENTS[vats[i]]) throw new Error('Unknown VAT treatment');
        lines.push({ description: d.trim(), quantity: Number(qtys[i] || 1), unit_price: L.toCents(prices[i]) / 100, vat_treatment: vats[i] });
      });
      if (!lines.length) throw new Error('Add at least one line with a description.');
      doc.lines = lines;
    } else {
      if (!doc.counterparty.name) throw new Error("Enter the supplier's name.");
      doc.total_gross = L.toCents(f.get('total_gross')) / 100;
      doc.total_vat = L.toCents(f.get('total_vat')) / 100;
      if (doc.total_vat > doc.total_gross) throw new Error('VAT cannot be more than the total paid.');
      doc.expense_category = f.get('expense_category') || 'Other';
      doc.business_pct = Number(f.get('business_pct') || 100);
      if (!(Number.isInteger(doc.business_pct) && doc.business_pct > 0 && doc.business_pct <= 100)) throw new Error('Business use must be between 1 and 100%.');
      doc.lines = [{ description: f.get('purchase_description').trim() || 'Purchase' }];
    }
    return [doc, clientId];
  }

  function importReview(id) {
    const row = data.imports[id];
    if (!row) throw new Error('That import no longer exists.');
    if (row.status === 'imported') { setTimeout(() => go(row.record_type === 'invoice' ? `#/invoices/${row.record_id}` : `#/expenses/${row.record_id}`)); return { html: '' }; }
    if (row.status !== 'review') { setTimeout(() => go('#/import')); return { html: '' }; }
    const doc = row.doc;
    const party = doc.counterparty || {};
    const clients = L.list(data.clients).sort((a, b) => a.name.localeCompare(b.name));
    const match = party.name ? L.matchClient(data, party) : null;
    const treatments = Object.entries(malta.VAT_TREATMENTS).map(([k, t]) => [k, t.label]);
    const lineRow = l => `<tr>
      <td><input name="description" value="${esc(l?.description)}" ${l ? '' : 'placeholder="Add a line…"'}></td>
      <td><input name="quantity" value="${l ? qty(l.quantity || 1) : 1}" class="short"></td>
      <td><input name="unit_price" value="${l ? Number(l.unit_price || 0).toFixed(2) : ''}" class="short"></td>
      <td><select name="vat_treatment">${opts(treatments, l?.vat_treatment)}</select></td></tr>`;
    const n2 = v => Number(v || 0).toFixed(2);
    return { title: 'Review import', html: `
      <div class="page-head"><h1>Review: ${esc(row.filename)}</h1><a class="btn secondary" href="#/import">← Back</a></div>
      ${row.problems?.length ? `<div class="callout"><strong>Please check:</strong><ul>${row.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <div class="review">
        <div class="preview card" id="preview"><p class="muted">Loading the original…</p></div>
        <form class="form" id="reviewForm">
          <fieldset>
            <label class="wide">This document is<select name="document_type" id="doctype">
              <option value="sales_invoice" ${doc.document_type !== 'purchase' ? 'selected' : ''}>My invoice to a client → add as an invoice</option>
              <option value="purchase" ${doc.document_type === 'purchase' ? 'selected' : ''}>A bill or receipt I paid → add as an expense</option></select></label>
            <label>Number<input name="number" value="${esc(doc.number)}"></label>
            <label>Date of issue<input type="date" name="issue_date" value="${esc(doc.issue_date)}" required></label>
            <label class="sales">Due date<input type="date" name="due_date" value="${esc(doc.due_date)}"></label>
            <label class="check sales"><input type="checkbox" name="paid" ${doc.paid ? 'checked' : ''}> Already paid</label>
            <label class="sales">Date paid<input type="date" name="paid_date" value="${esc(doc.paid_date)}"></label>
          </fieldset>
          <fieldset><legend id="partyLegend">Client</legend>
            <label class="wide sales">Match to client<select name="client_id" id="clientSelect">
              <option value="new">+ New client (details below)</option>${opts(clients.map(c => [c.id, c.name]), match?.id)}</select></label>
            <label>Name<input name="party_name" value="${esc(party.name)}"></label>
            <label>VAT number<input name="party_vat" value="${esc(party.vat_number)}"></label>
            <label class="wide new-party">Address<textarea name="party_address" rows="2">${esc(party.address)}</textarea></label>
            <label class="new-party">Email<input name="party_email" value="${esc(party.email)}"></label>
            <label class="new-party">Located in<select name="party_country">${opts(Object.entries(malta.COUNTRY_GROUPS), party.country)}</select></label>
            <label class="check new-party"><input type="checkbox" name="party_business" ${party.is_business !== false ? 'checked' : ''}> Business (not a private individual)</label>
          </fieldset>
          <div class="sales">
            <table class="lines"><thead><tr><th>Description</th><th>Qty</th><th>Unit price (€, excl. VAT)</th><th>VAT</th></tr></thead>
              <tbody>${(doc.lines || []).map(lineRow).join('')}${lineRow(null)}</tbody></table>
            <p class="hint">Printed totals: net €${n2(doc.total_net)} · VAT €${n2(doc.total_vat)} · total €${n2(doc.total_gross)}</p>
          </div>
          <fieldset class="purchase"><legend>Expense</legend>
            <label class="wide">Description<input name="purchase_description" value="${esc((doc.lines || []).map(l => l.description).join('; '))}"></label>
            <label>Total paid incl. VAT (€)<input name="total_gross" value="${n2(doc.total_gross)}"></label>
            <label>VAT included (€)<input name="total_vat" value="${n2(doc.total_vat)}"></label>
            <label>Category<select name="expense_category">${opts(malta.EXPENSE_CATEGORIES.map(c => [c, c]), doc.expense_category)}</select></label>
            <label>Business use %<input name="business_pct" type="number" min="1" max="100" value="100"></label>
          </fieldset>
          <label class="wide">Notes<textarea name="notes" rows="2">${esc(doc.notes)}</textarea></label>
          <p><button class="btn">Save to my accounts</button></p>
        </form>
      </div>
      <button class="btn danger" id="discardBtn">Discard</button>`,
      bind() {
        const type = document.getElementById('doctype');
        const client = document.getElementById('clientSelect');
        const sync = () => {
          const sales = type.value === 'sales_invoice';
          main.querySelectorAll('.sales').forEach(el => el.hidden = !sales);
          main.querySelectorAll('.purchase').forEach(el => el.hidden = sales);
          document.getElementById('partyLegend').textContent = sales ? 'Client' : 'Supplier';
          const newParty = !sales || client.value === 'new';
          main.querySelectorAll('.new-party').forEach(el => el.hidden = !newParty);
        };
        type.onchange = sync; client.onchange = sync; sync();
        document.getElementById('discardBtn').onclick = () => discard(id);

        let url = null, gone = false;
        cleanup.push(() => { gone = true; if (url) URL.revokeObjectURL(url); });
        store.getFile(row.file_id).then(async blob => {
          if (gone) return;
          if (row.media_type === claude.DOCX) {   // show the Word document as converted HTML, scripts disabled
            const html = await claude.docxToHtml(blob);
            if (gone) return;
            const frame = document.createElement('iframe');
            frame.title = 'Original document';
            frame.setAttribute('sandbox', '');
            frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 system-ui,sans-serif;margin:1rem;color:#1f2328;background:#fff}
              table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.25rem .4rem}img{max-width:100%}</style>${html}`;
            document.getElementById('preview').replaceChildren(frame);
            return;
          }
          url = URL.createObjectURL(blob);
          document.getElementById('preview').innerHTML = row.media_type === 'application/pdf'
            ? `<iframe src="${url}" title="Original document"></iframe>` : `<img src="${url}" alt="Original document">`;
        }).catch(e => { if (!gone) document.getElementById('preview').innerHTML = `<p class="muted">${esc(e.message)}</p>`; });

        document.getElementById('reviewForm').onsubmit = ev => {
          ev.preventDefault();
          let newDoc, clientId;
          try {
            [newDoc, clientId] = reviewFormToDoc(formValues(ev.target), doc);
            if (newDoc.document_type === 'sales_invoice' && L.list(data.invoices).some(i => i.number === newDoc.number))
              throw new Error(`Invoice number ${newDoc.number} is already used. Change it, or discard this document if it is a duplicate.`);
          } catch (e) { main.insertAdjacentHTML('afterbegin', `<div class="flash error">${esc(e.message)}</div>`); window.scrollTo(0, 0); return; }
          save(L.documentOps(data, data.imports[id], newDoc, store.newId, clientId), 'Saved to your accounts.', '#/import');
        };
      } };
  }

  // ---------------------------------------------------------------- Reports

  function reportsPage(year) {
    const s = L.yearSummary(data, year);
    const settings = S();
    const e = s.estimate;
    const pct = v => (e.profit ? v / e.profit * 100 : 0).toFixed(1) + '%';
    const calendar = malta.deadlines(year, settings.vat_registration, settings.part_time_regime === '1', settings.pays_class2 === '1', settings.provisional_tax === '1');
    return { title: 'Reports & tax', live: true, html: `
      <div class="page-head"><h1>Reports &amp; tax ${year}</h1>${yearPicker(year)}</div>
      <section class="card"><h2>Profit and loss</h2><table>
        <tr><th colspan="2">Income by client (excl. VAT, invoices sent or paid)</th></tr>
        ${s.byClient.map(([n, c]) => `<tr><td>${esc(n)}</td><td class="num">${eur(c)}</td></tr>`).join('')}
        <tr class="total"><td>Total income</td><td class="num">${eur(s.incomeNet)}</td></tr>
        <tr><th colspan="2">Allowable expenses by category</th></tr>
        ${s.byCategory.map(([n, c]) => `<tr><td>${esc(n)}</td><td class="num">${eur(c)}</td></tr>`).join('')}
        <tr class="total"><td>Total expenses</td><td class="num">${eur(s.expenseTotal)}</td></tr>
        <tr class="grand"><td>Net profit</td><td class="num">${eur(s.profit)}</td></tr>
      </table></section>
      <section class="card"><h2>Income tax estimate</h2>
        <p class="muted">${esc(malta.TAX_TABLES[e.status]?.label || e.status)} computation · employment income ${eur(e.employment)}
          (change in <a href="#/settings">Settings</a>). Shows the <em>extra</em> tax due because of your freelance profit;
          tax on your salary is already deducted through FSS.</p>
        <table><tr><th>Option</th><th class="num">Tax on freelance profit</th><th class="num">Effective rate</th></tr>
          <tr class="${e.bestOption === 'normal' ? 'best' : ''}"><td>Normal progressive rates (added to your salary)</td>
            <td class="num">${eur(e.normalTaxOnFreelance)}</td><td class="num">${pct(e.normalTaxOnFreelance)}</td></tr>
          ${e.partTimeEligible ? `<tr class="${e.bestOption === 'part_time' ? 'best' : ''}"><td>Part-time self-employment: 10% on first €${malta.PART_TIME_CAP.toLocaleString('en-GB')}
            ${e.partTimeExcessTax ? `<br><small>${eur(e.partTimeFlat)} flat + ${eur(e.partTimeExcessTax)} on the excess at normal rates</small>` : ''}</td>
            <td class="num">${eur(e.partTimeTaxOnFreelance)}</td><td class="num">${pct(e.partTimeTaxOnFreelance)}</td></tr>` : ''}
          ${settings.pays_class2 === '1' ? `<tr><td>Class 2 social security (15% of profit, capped)</td><td class="num">${eur(s.class2)}</td><td></td></tr>` : ''}
        </table>
        <p><strong>Suggested amount to set aside: ${eur(e.bestTaxOnFreelance + s.class2)}</strong></p>
      </section>
      ${settings.vat_registration === 'article10' ? `<section class="card"><h2>VAT return summary (Article 10)</h2>
        <table><tr><th>Quarter</th><th class="num">Sales (net)</th><th class="num">Output VAT</th><th class="num">Purchases (net)</th><th class="num">Input VAT</th><th class="num">Payable / (refund)</th></tr>
        ${Object.entries(s.quarters).map(([q, r]) => `<tr><td>Q${q}</td><td class="num">${eur(r.sales)}</td><td class="num">${eur(r.output_vat)}</td>
          <td class="num">${eur(r.purchases)}</td><td class="num">${eur(r.input_vat)}</td><td class="num">${eur(r.payable)}</td></tr>`).join('')}</table>
        <p class="hint">VAT periods are assumed to be calendar quarters; yours may be staggered – check your VAT certificate.</p></section>`
      : `<section class="card"><h2>VAT – ${esc(malta.VAT_REGISTRATIONS[settings.vat_registration])}</h2>
        <p>Domestic turnover ${eur(s.domesticTurnover)} against the Article 11 threshold of ${eur(s.threshold)}.
          Figures for your annual declaration: total sales ${eur(s.incomeNet)}, total purchases ${eur(s.expenseTotal)}.</p></section>`}
      <section class="card"><h2>Compliance calendar for ${year}</h2><ul class="deadlines">
        ${calendar.map(d => `<li class="${d.date < s.today ? 'past' : ''}"><time>${fmtDate(d.date)}</time> ${esc(d.label)}</li>`).join('')}</ul></section>
      <p class="no-print"><button class="link" id="csvInv">Invoices CSV</button> · <button class="link" id="csvExp">Expenses CSV</button> ·
        <button class="link" onclick="window.print()">Print this report</button></p>`,
      bind() {
        document.getElementById('csvInv').onclick = () => download(`invoices-${year}.csv`, L.invoicesCsv(data, year));
        document.getElementById('csvExp').onclick = () => download(`expenses-${year}.csv`, L.expensesCsv(data, year));
      } };
  }

  render();
}
