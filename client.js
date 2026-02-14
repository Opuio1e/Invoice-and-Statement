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

function renderSummaryTables() {
  const cashFlowBody = document.querySelector('#cash-flow .table-body');
  const statementBody = document.querySelector('#partywise-statement .table-body');
  const ledgerBody = document.querySelector('#client-ledger .table-body');

  let running = 0;
  cashFlowBody.innerHTML = generatedInvoices.map((invoice) => {
    const amount = invoice.rows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);
    running += amount;
    return `<div class="table-row"><span class="cell">${formatDate(invoice.date)}</span><span class="cell">${invoice.party}</span><span class="cell">${invoice.transactionType}</span><span class="cell">${amount.toFixed(2)}</span><span class="cell">${running.toFixed(2)}</span><span class="cell"></span></div>`;
  }).join('') + `<div class="row-count">${generatedInvoices.length} row(s)</div>`;

  statementBody.innerHTML = generatedInvoices.map((invoice) => {
    const amount = invoice.rows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);
    return `<div class="table-row"><span class="cell">${formatDate(invoice.date)}</span><span class="cell">${invoice.invoiceNumber}</span><span class="cell">${invoice.transactionType}</span><span class="cell">${amount.toFixed(2)}</span><span class="cell">0.00</span><span class="cell">${amount.toFixed(2)}</span></div>`;
  }).join('') + `<div class="row-count">${generatedInvoices.length} row(s)</div>`;

  ledgerBody.innerHTML = generatedInvoices.map((invoice) => {
    const amount = invoice.rows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);
    return `<div class="table-row"><span class="cell">${invoice.invoiceNumber}</span><span class="cell">${formatDate(invoice.date)}</span><span class="cell">${invoice.transactionType}</span><span class="cell">${amount.toFixed(2)}</span><span class="cell">0.00</span><span class="cell">${amount.toFixed(2)}</span></div>`;
  }).join('') + `<div class="row-count">${generatedInvoices.length} row(s)</div>`;
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
  renderInvoiceRows(invoice);
  renderReportTable();
  renderSummaryTables();

  document.querySelectorAll('#invoice-ui [data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const rowEl = e.target.closest('.table-row');
      const rowId = rowEl?.dataset.rowId;
      invoice.rows = invoice.rows.filter((row) => row.id !== rowId);
      renderInvoiceRows(invoice);
      renderReportTable();
      renderSummaryTables();
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
  renderReportTable();
  initPageNavigation();
  initEventListeners();
});
