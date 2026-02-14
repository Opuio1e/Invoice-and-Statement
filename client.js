import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm';

const supabaseUrl = window.SUPABASE_URL;
const supabaseKey = window.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const LISTS = ['lot_names', 'shapes', 'sizes', 'descriptions', 'grades'];
const cache = {};
const generatedInvoices = [];
const reportState = {
  persistedInvoices: [],
};

const reportSelectors = {
  root: '#invoice-report',
  filterDateFrom: '#invoice-report .filter-item:nth-child(1) input',
  filterDateTo: '#invoice-report .filter-item:nth-child(2) input',
  filterSource: '#invoice-report .filter-item:nth-child(3) select',
  clearButton: '#invoice-report .filter-actions .outline-button',
  printButton: '#invoice-report .filter-actions .primary-button',
  reportTableBody: '#invoice-report .invoice-table tbody',
  printTableBody: '#invoice-report .print-table tbody',
  reportMetaValues: '#invoice-report .report-header .meta-value',
  printSummaryRows: '#invoice-report .print-summary p',
};

let reportDom = null;

async function loadLists() {
  for (const listName of LISTS) {
    const { data, error } = await supabase
      .from(listName)
      .select('name')
      .order('name');

    if (error) {
      console.error(`Error loading ${listName}:`, error);
      cache[listName] = [];
    } else {
      cache[listName] = data.map(item => item.name);
    }
  }
  renderLists();
}

function renderLists() {
  for (const listName of LISTS) {
    const chipRow = document.querySelector(`[data-list="${listName}"] .chip-row`);
    if (chipRow) {
      chipRow.innerHTML = cache[listName]
        .map(name => `<span class="chip">${name} <button data-action="remove" data-value="${name}">×</button></span>`)
        .join('');
    }

    const select = document.querySelector(`select[data-saved-list="${listName}"]`);
    if (select) {
      const options = cache[listName].map(name => `<option>${name}</option>`).join('');
      select.innerHTML = '<option>-- Select --</option>' + options;
    }
  }
}

async function addToList(listName, value) {
  if (!value || cache[listName].includes(value)) return;

  const { error } = await supabase
    .from(listName)
    .insert([{ name: value }]);

  if (error) {
    alert(`Error: ${error.message}`);
  } else {
    cache[listName].push(value);
    renderLists();
  }
}

async function removeFromList(listName, value) {
  const { error } = await supabase
    .from(listName)
    .delete()
    .eq('name', value);

  if (error) {
    alert(`Error: ${error.message}`);
  } else {
    cache[listName] = cache[listName].filter(item => item !== value);
    renderLists();
  }
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [month, day, year] = value.split('/');
  if (!month || !day || !year) return new Date().toISOString().slice(0, 10);
  return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toComparableDate(value) {
  if (!value) return null;
  const iso = toIsoDate(value);
  return new Date(`${iso}T00:00:00`);
}

function normalizeInvoice(invoice) {
  const rowSource = invoice.rows || invoice.items || [];
  const transactionType = invoice.transactionType || invoice.type || 'Sales';
  return {
    id: invoice.id || invoice.invoiceNumber || Date.now(),
    invoiceNumber: invoice.invoiceNumber || invoice.invoice_no || '',
    date: toIsoDate(invoice.date),
    party: invoice.party || '',
    transactionType,
    source: invoice.source || transactionType,
    sellId: invoice.sellId || invoice.sell_id || invoice.sourceId || '',
    rows: rowSource.map((row, index) => ({
      id: row.id || `${invoice.id || 'invoice'}-${index}`,
      lotName: row.lotName || row.lotNo || '',
      description: row.description || '',
      shape: row.shape || '',
      size: row.size || '',
      grade: row.grade || '',
      pcs: toNumber(row.pcs),
      cts: toNumber(row.cts),
      price: toNumber(row.price),
      remarks: row.remarks || '',
    })),
  };
}

function getReportFilters() {
  const selectedSource = reportDom?.filterSource?.value || '';
  return {
    dateFrom: reportDom?.filterDateFrom?.value || '',
    dateTo: reportDom?.filterDateTo?.value || '',
    source: selectedSource === 'All Sources' ? '' : selectedSource,
    party: reportDom?.partyFilter?.value || '',
    transactionType: reportDom?.transactionTypeFilter?.value || '',
    sellId: reportDom?.sellIdFilter?.value || '',
  };
}

async function loadPersistedInvoices() {
  try {
    const response = await fetch('/api/invoices');
    if (response.ok) {
      const payload = await response.json();
      reportState.persistedInvoices = (payload.invoices || []).map(normalizeInvoice);
      refreshReportFilterOptions();
      return;
    }
  } catch (error) {
    console.warn('API invoices unavailable, trying Supabase fallback.', error);
  }

  try {
    const { data, error } = await supabase.from('invoices').select('*').order('date', { ascending: false });
    if (error) throw error;
    reportState.persistedInvoices = (data || []).map(normalizeInvoice);
    refreshReportFilterOptions();
  } catch (error) {
    console.warn('Supabase invoices unavailable, using local invoice rows only.', error);
    reportState.persistedInvoices = generatedInvoices.map(normalizeInvoice);
    refreshReportFilterOptions();
  }
}


function refreshReportFilterOptions() {
  if (!reportDom?.filterSource) return;
  const existing = reportDom.filterSource.value;
  const sources = [...new Set(reportState.persistedInvoices.map((invoice) => invoice.source).filter(Boolean))];
  reportDom.filterSource.innerHTML = ['<option>All Sources</option>', ...sources.map((source) => `<option>${escapeHtml(source)}</option>`)].join('');
  if (sources.includes(existing)) reportDom.filterSource.value = existing;
}

async function persistInvoice(invoice) {
  const payload = {
    party: invoice.party,
    transactionType: invoice.transactionType,
    date: invoice.date,
    items: invoice.rows.map((row) => ({
      lotNo: row.lotName,
      description: row.description,
      shape: row.shape,
      size: row.size,
      grade: row.grade,
      pcs: toNumber(row.pcs),
      cts: toNumber(row.cts),
      price: toNumber(row.price),
      remarks: row.remarks,
    })),
  };

  try {
    await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Could not persist invoice via API.', error);
  }
}

function renderInvoiceReport(invoices, filters = {}) {
  if (!reportDom?.reportTableBody || !reportDom?.printTableBody) return;

  const fromDate = toComparableDate(filters.dateFrom);
  const toDate = toComparableDate(filters.dateTo);
  const normParty = (filters.party || '').trim().toLowerCase();
  const normType = (filters.transactionType || '').trim().toLowerCase();
  const normSource = (filters.source || '').trim().toLowerCase();
  const normSellId = (filters.sellId || '').trim().toLowerCase();

  const filteredInvoices = invoices.filter((invoice) => {
    const invoiceDate = toComparableDate(invoice.date);
    const invoiceParty = String(invoice.party || '').toLowerCase();
    const invoiceType = String(invoice.transactionType || '').toLowerCase();
    const invoiceSource = String(invoice.source || '').toLowerCase();
    const invoiceSellId = String(invoice.sellId || '').toLowerCase();

    if (fromDate && invoiceDate && invoiceDate < fromDate) return false;
    if (toDate && invoiceDate && invoiceDate > toDate) return false;
    if (normParty && !invoiceParty.includes(normParty)) return false;
    if (normType && invoiceType !== normType) return false;
    if (normSource && invoiceSource !== normSource) return false;
    if (normSellId && invoiceSellId !== normSellId) return false;
    return true;
  });

  const flattenedRows = filteredInvoices.flatMap((invoice) =>
    invoice.rows.map((row) => ({ ...row, invoice }))
  );

  if (!flattenedRows.length) {
    reportDom.reportTableBody.innerHTML = '<tr><td colspan="11">No invoice records found.</td></tr>';
    reportDom.printTableBody.innerHTML = '<tr><td colspan="11">No invoice records found.</td></tr>';
  } else {
    const rowsHtml = flattenedRows.map((entry, index) => {
      const amount = toNumber(entry.cts) * toNumber(entry.price);
      return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.lotName)}</td>
        <td>${escapeHtml(entry.description)}</td>
        <td>${escapeHtml(entry.shape)}</td>
        <td>${escapeHtml(entry.size)}</td>
        <td>${escapeHtml(entry.grade)}</td>
        <td>${toNumber(entry.pcs)}</td>
        <td>${toNumber(entry.cts).toFixed(2)}</td>
        <td>${toNumber(entry.price).toFixed(2)}</td>
        <td>${amount.toFixed(2)}</td>
        <td>${escapeHtml(entry.remarks)}</td>
      </tr>`;
    }).join('');
    reportDom.reportTableBody.innerHTML = rowsHtml;
    reportDom.printTableBody.innerHTML = rowsHtml;
  }

  const totalPcs = flattenedRows.reduce((sum, row) => sum + toNumber(row.pcs), 0);
  const totalCts = flattenedRows.reduce((sum, row) => sum + toNumber(row.cts), 0);
  const totalAmount = flattenedRows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);
  const averagePrice = totalCts ? totalAmount / totalCts : 0;
  const firstInvoice = filteredInvoices[0];

  reportDom.metaValues.date.textContent = firstInvoice ? formatDate(firstInvoice.date) : '-';
  reportDom.metaValues.invoiceNo.textContent = firstInvoice?.invoiceNumber || '-';
  reportDom.metaValues.transactionType.textContent = filters.transactionType || firstInvoice?.transactionType || 'All Types';
  reportDom.metaValues.party.textContent = filters.party || firstInvoice?.party || 'All Parties';
  reportDom.metaValues.sellId.textContent = filters.sellId || firstInvoice?.sellId || '-';
  reportDom.metaValues.totalCts.textContent = `${totalCts.toFixed(2)} (${totalPcs.toFixed(0)} pcs)`;
  reportDom.metaValues.totalAmount.textContent = totalAmount.toFixed(2);
  reportDom.metaValues.averagePrice.textContent = averagePrice.toFixed(2);

  writeSummaryValue(reportDom.printSummary.date, firstInvoice ? firstInvoice.date : '-');
  writeSummaryValue(reportDom.printSummary.transactionType, filters.transactionType || firstInvoice?.transactionType || 'All Types');
  writeSummaryValue(reportDom.printSummary.sellId, filters.sellId || firstInvoice?.sellId || '-');
  writeSummaryValue(reportDom.printSummary.totalAmount, totalAmount.toFixed(2));
  writeSummaryValue(reportDom.printSummary.invoiceNo, firstInvoice?.invoiceNumber || '-');
  writeSummaryValue(reportDom.printSummary.party, filters.party || firstInvoice?.party || 'All Parties');
  writeSummaryValue(reportDom.printSummary.totalCts, `${totalCts.toFixed(2)} (${totalPcs.toFixed(0)} pcs)`);
  writeSummaryValue(reportDom.printSummary.averagePrice, averagePrice.toFixed(2));
}

function renderInvoiceRows(invoice) {
  const tableBody = document.querySelector('#invoice-ui .table-body');
  tableBody.innerHTML = invoice.rows.map((row) => `
    <div class="table-row" data-row-id="${row.id}">
      <span class="cell">${row.txId}</span>
      <span class="cell">${row.stone}</span>
      <span class="cell">${formatDate(invoice.date)}</span>
      <span class="cell">${invoice.party}</span>
      <span class="cell">${row.deet}</span>
      <span class="cell">${row.lotName}</span>
      <span class="cell editable" contenteditable="true">${row.grade}</span>
      <span class="cell editable" contenteditable="true">${row.description}</span>
      <span class="cell editable" contenteditable="true">${row.shape}</span>
      <span class="cell editable" contenteditable="true">${row.size}</span>
      <span class="cell editable" contenteditable="true">${row.cts}</span>
      <span class="cell editable" contenteditable="true">${row.price}</span>
      <span class="cell">${(toNumber(row.cts) * toNumber(row.price)).toFixed(2)}</span>
      <span class="cell editable" contenteditable="true">${row.remarks}</span>
      <span class="cell"><button class="small-button" data-action="delete">Delete</button></span>
    </div>
  `).join('') + `<div class="row-count">${invoice.rows.length} row(s)</div>`;
}

function renderReportTable() {
  renderInvoiceReport(reportState.persistedInvoices, getReportFilters());
}

function getCashFlowFilters() {
  const cashFlowRoot = document.querySelector('#cash-flow');
  if (!cashFlowRoot) {
    return { from: '', to: '', transactionType: '', party: '' };
  }

  const from = cashFlowRoot.querySelector('.field:nth-child(1) input')?.value || '';
  const to = cashFlowRoot.querySelector('.field:nth-child(2) input')?.value || '';
  const transactionType = cashFlowRoot.querySelector('.field:nth-child(3) select')?.value || '';
  const party = cashFlowRoot.querySelector('.field:nth-child(4) input')?.value || '';

  return { from, to, transactionType, party };
}

function renderCashFlowTable(rows = []) {
  const cashFlowBody = document.querySelector('#cash-flow .table-body');
  if (!cashFlowBody) return;

  if (!rows.length) {
    cashFlowBody.innerHTML = '<div class="row-count">0 row(s)</div>';
    return;
  }

  cashFlowBody.innerHTML = rows.map((row) => `
    <div class="table-row">
      <span class="cell">${formatDate(row.date)}</span>
      <span class="cell">${escapeHtml(row.party)}</span>
      <span class="cell">${escapeHtml(row.type)}</span>
      <span class="cell">${toNumber(row.amount).toFixed(2)}</span>
      <span class="cell">${toNumber(row.balance).toFixed(2)}</span>
      <span class="cell">${escapeHtml(row.remarks || '')}</span>
    </div>
  `).join('') + `<div class="row-count">${rows.length} row(s)</div>`;
}

function getStatementTransactionColumns(transactionType, amount) {
  const normalizedType = String(transactionType || '').trim().toLowerCase();
  const creditTypes = ['purchase', 'payment', 'receipt', 'credit', 'return'];
  const isCredit = creditTypes.some((type) => normalizedType.includes(type));
  return {
    debit: isCredit ? 0 : amount,
    credit: isCredit ? amount : 0,
  };
}

function getPartywiseStatementFilters() {
  const partywiseRoot = document.querySelector('#partywise-statement');
  if (!partywiseRoot) {
    return { party: '', from: '', to: '' };
  }

  return {
    party: partywiseRoot.querySelector('#partywise-party')?.value || '',
    from: partywiseRoot.querySelector('#partywise-from')?.value || '',
    to: partywiseRoot.querySelector('#partywise-to')?.value || '',
  };
}

function renderPartywiseStatement(rows = []) {
  const statementBody = document.querySelector('#partywise-statement .table-body');
  if (!statementBody) return;

  if (!rows.length) {
    statementBody.innerHTML = '<div class="row-count">0 row(s)</div>';
    return;
  }

  statementBody.innerHTML = `${rows.map((row) => `
    <div class="table-row">
      <span class="cell">${formatDate(row.date)}</span>
      <span class="cell">${escapeHtml(row.refNo || '')}</span>
      <span class="cell">${escapeHtml(row.description || '')}</span>
      <span class="cell">${toNumber(row.debit).toFixed(2)}</span>
      <span class="cell">${toNumber(row.credit).toFixed(2)}</span>
      <span class="cell">${toNumber(row.balance).toFixed(2)}</span>
    </div>
  `).join('')}<div class="row-count">${rows.length} row(s)</div>`;
}

async function loadParties() {
  const partySelect = document.querySelector('#partywise-party');
  if (!partySelect) return;

  let parties = [];

  try {
    const response = await fetch('/api/parties');
    if (!response.ok) throw new Error(`Parties API failed: ${response.status}`);
    const payload = await response.json();
    parties = payload.parties || [];
  } catch (error) {
    console.warn('Parties API unavailable, trying Supabase fallback.', error);
  }

  if (!parties.length) {
    try {
      const { data, error } = await supabase.from('parties').select('name').order('name');
      if (error) throw error;
      parties = (data || []).map((row) => row.name);
    } catch (error) {
      console.warn('Supabase parties unavailable, using invoices fallback.', error);
      parties = reportState.persistedInvoices.map((invoice) => invoice.party).filter(Boolean);
    }
  }

  const current = partySelect.value;
  const uniqueParties = [...new Set(parties)].sort((a, b) => a.localeCompare(b));
  partySelect.innerHTML = ['<option value="">Select Party</option>', ...uniqueParties.map((party) => `<option>${escapeHtml(party)}</option>`)].join('');

  if (current && uniqueParties.includes(current)) {
    partySelect.value = current;
  }
}

async function loadPartywiseStatement() {
  const filters = getPartywiseStatementFilters();
  if (!filters.party) {
    renderPartywiseStatement([]);
    return;
  }

  const params = new URLSearchParams({ party: filters.party });
  if (filters.from) params.set('from', toIsoDate(filters.from));
  if (filters.to) params.set('to', toIsoDate(filters.to));

  try {
    const response = await fetch(`/api/partywise-statement?${params.toString()}`);
    if (!response.ok) throw new Error(`Partywise statement API failed: ${response.status}`);
    const payload = await response.json();
    renderPartywiseStatement(payload.statement || []);
    return;
  } catch (error) {
    console.warn('Partywise statement API unavailable, trying Supabase fallback.', error);
  }

  try {
    let query = supabase.from('invoices').select('*').eq('party', filters.party).order('date', { ascending: true });
    if (filters.from) query = query.gte('date', toIsoDate(filters.from));
    if (filters.to) query = query.lte('date', toIsoDate(filters.to));

    const { data, error } = await query;
    if (error) throw error;

    let runningBalance = 0;
    const statement = (data || []).map((invoice) => {
      const normalized = normalizeInvoice(invoice);
      const amount = normalized.rows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);
      const { debit, credit } = getStatementTransactionColumns(normalized.transactionType, amount);
      runningBalance += debit - credit;
      return {
        date: normalized.date,
        refNo: normalized.invoiceNumber,
        description: normalized.transactionType,
        debit,
        credit,
        balance: runningBalance,
      };
    });

    renderPartywiseStatement(statement);
  } catch (error) {
    console.warn('Unable to load partywise statement from Supabase fallback.', error);
    renderPartywiseStatement([]);
  }
}

async function loadCashFlow() {
  const filters = getCashFlowFilters();
  const params = new URLSearchParams();
  if (filters.from) params.set('from', toIsoDate(filters.from));
  if (filters.to) params.set('to', toIsoDate(filters.to));
  if (filters.transactionType) params.set('transactionType', filters.transactionType);
  if (filters.party.trim()) params.set('party', filters.party.trim());

  try {
    const response = await fetch(`/api/cash-flow?${params.toString()}`);
    if (!response.ok) throw new Error(`Cash flow API failed: ${response.status}`);
    const payload = await response.json();
    renderCashFlowTable(payload.rows || []);
    return;
  } catch (error) {
    console.warn('Cash flow API unavailable, trying Supabase fallback.', error);
  }

  try {
    let query = supabase.from('invoices').select('*').order('date', { ascending: true });
    if (filters.from) query = query.gte('date', toIsoDate(filters.from));
    if (filters.to) query = query.lte('date', toIsoDate(filters.to));
    if (filters.transactionType) query = query.eq('transactionType', filters.transactionType);
    if (filters.party.trim()) query = query.ilike('party', `%${filters.party.trim()}%`);

    const { data, error } = await query;
    if (error) throw error;

    let runningBalance = 0;
    const rows = (data || []).map((invoice) => {
      const normalized = normalizeInvoice(invoice);
      const amount = normalized.rows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);
      runningBalance += amount;
      return {
        date: normalized.date,
        party: normalized.party,
        type: normalized.transactionType,
        amount,
        balance: runningBalance,
        remarks: invoice.remarks || '',
      };
    });

    renderCashFlowTable(rows);
  } catch (error) {
    console.warn('Unable to load cash flow from Supabase fallback.', error);
    renderCashFlowTable([]);
  }
}

function getClientLedgerFilters() {
  const root = document.querySelector('#client-ledger');
  if (!root) {
    return { party: '', from: '', to: '' };
  }

  return {
    party: root.querySelector('#client-ledger-party')?.value.trim() || '',
    from: root.querySelector('#client-ledger-from')?.value || '',
    to: root.querySelector('#client-ledger-to')?.value || '',
  };
}

function renderClientLedger(rows = []) {
  const ledgerBody = document.querySelector('#client-ledger .table-body');
  if (!ledgerBody) return;

  if (!rows.length) {
    ledgerBody.innerHTML = '<div class="table-row"><span class="cell" style="grid-column: 1 / -1;">No ledger entries found.</span></div><div class="row-count">0 row(s)</div>';
    return;
  }

  ledgerBody.innerHTML = `${rows.map((row) => `
    <div class="table-row">
      <span class="cell">${escapeHtml(row.refNo || '')}</span>
      <span class="cell">${formatDate(row.date)}</span>
      <span class="cell">${escapeHtml(row.description || '')}</span>
      <span class="cell">${toNumber(row.debit).toFixed(2)}</span>
      <span class="cell">${toNumber(row.credit).toFixed(2)}</span>
      <span class="cell">${toNumber(row.balance).toFixed(2)}</span>
    </div>
  `).join('')}<div class="row-count">${rows.length} row(s)</div>`;
}

async function loadClientLedger() {
  const filters = getClientLedgerFilters();
  if (!filters.party) {
    renderClientLedger([]);
    return;
  }

  const params = new URLSearchParams({ party: filters.party });
  if (filters.from) params.set('from', toIsoDate(filters.from));
  if (filters.to) params.set('to', toIsoDate(filters.to));

  try {
    const response = await fetch(`/api/client-ledger?${params.toString()}`);
    if (!response.ok) throw new Error(`Client ledger API failed: ${response.status}`);
    const payload = await response.json();
    renderClientLedger(payload.ledger || []);
  } catch (error) {
    console.warn('Unable to load client ledger.', error);
    renderClientLedger([]);
  }
}

function renderSummaryTables() {
  return loadClientLedger();
}

async function generateRows() {
  const rowCount = Math.max(1, parseInt(document.getElementById('invoice-row-count')?.value, 10) || 1);
  const date = toIsoDate(document.getElementById('invoice-date')?.value);
  const party = document.getElementById('invoice-party')?.value.trim() || 'Walk-in Party';
  const transactionType = document.getElementById('invoice-transaction-type')?.value || 'Sales';
  const baseGrade = document.querySelector('select[data-saved-list="grades"]')?.value;
  const description = document.querySelector('select[data-saved-list="descriptions"]')?.value;
  const shape = document.querySelector('select[data-saved-list="shapes"]')?.value;
  const size = document.querySelector('select[data-saved-list="sizes"]')?.value;
  const lotName = document.querySelector('select[data-saved-list="lot_names"]')?.value;

  const invoice = {
    id: Date.now(),
    invoiceNumber: `INV-${date.replace(/-/g, '')}-${String(generatedInvoices.length + 1).padStart(4, '0')}`,
    date,
    party,
    transactionType,
    rows: Array.from({ length: rowCount }, (_, index) => ({
      id: `${Date.now()}-${index}`,
      txId: `${generatedInvoices.length + 1}-${index + 1}`,
      stone: 'Calibrate',
      deet: '',
      lotName: lotName !== '-- Select --' ? lotName : '',
      grade: baseGrade !== '-- Select --' ? baseGrade : '',
      description: description !== '-- Select --' ? description : '',
      shape: shape !== '-- Select --' ? shape : '',
      size: size !== '-- Select --' ? size : '',
      pcs: 1,
      cts: 0,
      price: 0,
      remarks: '',
    })),
  };

  generatedInvoices.push(invoice);
  await persistInvoice(invoice);
  await loadPersistedInvoices();
  await loadParties();
  renderInvoiceRows(invoice);
  renderReportTable();
  await renderSummaryTables();
  await loadCashFlow();
  await loadPartywiseStatement();

  document.querySelectorAll('#invoice-ui [data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const rowEl = e.target.closest('.table-row');
      const rowId = rowEl?.dataset.rowId;
      invoice.rows = invoice.rows.filter((row) => row.id !== rowId);
      renderInvoiceRows(invoice);
      renderReportTable();
      renderSummaryTables();
      loadCashFlow();
      loadPartywiseStatement();
    });
  });
}

function updateRowCount() {
  const count = document.querySelectorAll('.table-row').length;
  const rowCountDiv = document.querySelector('.row-count');
  if (rowCountDiv) {
    rowCountDiv.textContent = `${count} row(s)`;
  }
}


function resolveInitialPage() {
  const hash = window.location.hash;
  if (!hash) return 'invoice-ui';
  const pageId = hash.slice(1);
  return document.getElementById(pageId) ? pageId : 'invoice-ui';
}

function setActivePage(pageId) {
  const pages = document.querySelectorAll('[data-page]');
  const links = document.querySelectorAll('[data-page-link]');

  pages.forEach((page) => {
    page.hidden = page.id !== pageId;
  });

  links.forEach((link) => {
    const isActive = link.getAttribute('href') === `#${pageId}`;
    link.classList.toggle('is-active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function initPageNavigation() {
  const goToPage = () => setActivePage(resolveInitialPage());
  window.addEventListener('hashchange', goToPage);
  goToPage();
}

function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function initEventListeners() {
  const generateRowsBtn = document.getElementById('generate-rows-button');
  if (generateRowsBtn) {
    generateRowsBtn.addEventListener('click', generateRows);
  }

  for (const listName of LISTS) {
    const panel = document.querySelector(`[data-list="${listName}"]`);
    if (panel) {
      const input = panel.querySelector('input');
      const addBtn = panel.querySelector('.small-button');

      addBtn.addEventListener('click', () => {
        addToList(listName, input.value);
        input.value = '';
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addToList(listName, input.value);
          input.value = '';
        }
      });

      panel.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'remove') {
          removeFromList(listName, e.target.dataset.value);
        }
      });
    }
  }

  if (reportDom) {
    [reportDom.filterDateFrom, reportDom.filterDateTo, reportDom.filterSource].forEach((control) => {
      control?.addEventListener('change', () => renderInvoiceReport(reportState.persistedInvoices, getReportFilters()));
      control?.addEventListener('input', () => renderInvoiceReport(reportState.persistedInvoices, getReportFilters()));
    });

    reportDom.clearButton?.addEventListener('click', () => {
      if (reportDom.filterDateFrom) reportDom.filterDateFrom.value = '';
      if (reportDom.filterDateTo) reportDom.filterDateTo.value = '';
      if (reportDom.filterSource) reportDom.filterSource.selectedIndex = 0;
      renderInvoiceReport(reportState.persistedInvoices, {});
    });

    reportDom.printButton?.addEventListener('click', () => {
      document.body.classList.add('print-report-view');
      window.print();
      setTimeout(() => document.body.classList.remove('print-report-view'), 0);
    });
  }

  const cashFlowRoot = document.querySelector('#cash-flow');
  if (cashFlowRoot) {
    const fromInput = cashFlowRoot.querySelector('.field:nth-child(1) input');
    const toInput = cashFlowRoot.querySelector('.field:nth-child(2) input');
    const typeSelect = cashFlowRoot.querySelector('.field:nth-child(3) select');
    const partyInput = cashFlowRoot.querySelector('.field:nth-child(4) input');

    fromInput?.addEventListener('change', loadCashFlow);
    toInput?.addEventListener('change', loadCashFlow);
    typeSelect?.addEventListener('change', loadCashFlow);
    partyInput?.addEventListener('input', debounce(loadCashFlow, 300));
  }

  const partywiseRoot = document.querySelector('#partywise-statement');
  if (partywiseRoot) {
    const partySelect = partywiseRoot.querySelector('#partywise-party');
    const fromInput = partywiseRoot.querySelector('#partywise-from');
    const toInput = partywiseRoot.querySelector('#partywise-to');

    partySelect?.addEventListener('change', loadPartywiseStatement);
    fromInput?.addEventListener('change', loadPartywiseStatement);
    toInput?.addEventListener('change', loadPartywiseStatement);
  }

  const clientLedgerRoot = document.querySelector('#client-ledger');
  if (clientLedgerRoot) {
    const partyInput = clientLedgerRoot.querySelector('#client-ledger-party');
    const fromInput = clientLedgerRoot.querySelector('#client-ledger-from');
    const toInput = clientLedgerRoot.querySelector('#client-ledger-to');

    partyInput?.addEventListener('change', loadClientLedger);
    partyInput?.addEventListener('input', debounce(loadClientLedger, 300));
    fromInput?.addEventListener('change', loadClientLedger);
    toInput?.addEventListener('change', loadClientLedger);
  }
}

function initInvoiceReportDom() {
  const reportMetaValues = Array.from(document.querySelectorAll(reportSelectors.reportMetaValues));
  const printSummaryRows = Array.from(document.querySelectorAll(reportSelectors.printSummaryRows));

  reportDom = {
    root: document.querySelector(reportSelectors.root),
    filterDateFrom: document.querySelector(reportSelectors.filterDateFrom),
    filterDateTo: document.querySelector(reportSelectors.filterDateTo),
    filterSource: document.querySelector(reportSelectors.filterSource),
    clearButton: document.querySelector(reportSelectors.clearButton),
    printButton: document.querySelector(reportSelectors.printButton),
    reportTableBody: document.querySelector(reportSelectors.reportTableBody),
    printTableBody: document.querySelector(reportSelectors.printTableBody),
    metaValues: {
      date: reportMetaValues[0],
      invoiceNo: reportMetaValues[1],
      transactionType: reportMetaValues[2],
      party: reportMetaValues[3],
      sellId: reportMetaValues[4],
      totalCts: reportMetaValues[5],
      totalAmount: reportMetaValues[6],
      averagePrice: reportMetaValues[7],
    },
    printSummary: {
      date: printSummaryRows[0]?.querySelector('strong')?.nextSibling,
      transactionType: printSummaryRows[1]?.querySelector('strong')?.nextSibling,
      sellId: printSummaryRows[2]?.querySelector('strong')?.nextSibling,
      totalAmount: printSummaryRows[3]?.querySelector('strong')?.nextSibling,
      invoiceNo: printSummaryRows[4]?.querySelector('strong')?.nextSibling,
      party: printSummaryRows[5]?.querySelector('strong')?.nextSibling,
      totalCts: printSummaryRows[6]?.querySelector('strong')?.nextSibling,
      averagePrice: printSummaryRows[7]?.querySelector('strong')?.nextSibling,
    },
  };
}

function writeSummaryValue(textNode, value) {
  if (!textNode) return;
  textNode.textContent = ` ${value}`;
}

function fixListPanelMarkup() {
  const panels = document.querySelectorAll('.list-panel');
  panels.forEach(panel => {
    const title = panel.querySelector('h4').textContent.toLowerCase().replace(/ /g, '_');
    panel.dataset.list = title;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  fixListPanelMarkup();
  initInvoiceReportDom();
  await loadLists();
  await loadPersistedInvoices();
  await loadParties();
  renderReportTable();
  await loadCashFlow();
  await loadPartywiseStatement();
  await loadClientLedger();
  initPageNavigation();
  initEventListeners();
});
