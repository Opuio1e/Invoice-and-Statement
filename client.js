import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm';

const supabaseUrl = window.SUPABASE_URL;
const supabaseKey = window.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const LISTS = ['lot_names', 'shapes', 'sizes', 'descriptions', 'grades'];
const cache = {};
const generatedInvoices = [];

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
  const reportBody = document.querySelector('.invoice-table tbody');
  const printBody = document.querySelector('.print-table tbody');
  const latestInvoice = generatedInvoices[generatedInvoices.length - 1];

  if (!latestInvoice) {
    reportBody.innerHTML = '<tr><td colspan="11">No rows generated yet.</td></tr>';
    printBody.innerHTML = '<tr><td colspan="11">No rows generated yet.</td></tr>';
    return;
  }

  const reportRows = latestInvoice.rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${row.lotName}</td>
      <td>${row.description}</td>
      <td>${row.shape}</td>
      <td>${row.size}</td>
      <td>${row.grade}</td>
      <td>${row.pcs}</td>
      <td>${row.cts}</td>
      <td>${row.price}</td>
      <td>${(toNumber(row.cts) * toNumber(row.price)).toFixed(2)}</td>
      <td>${row.remarks}</td>
    </tr>
  `).join('');

  const totalCts = latestInvoice.rows.reduce((sum, row) => sum + toNumber(row.cts), 0);
  const totalAmount = latestInvoice.rows.reduce((sum, row) => sum + (toNumber(row.cts) * toNumber(row.price)), 0);

  reportBody.innerHTML = reportRows;
  printBody.innerHTML = `${reportRows}
    <tr>
      <td colspan="6" class="totals-label">Totals:</td>
      <td>${latestInvoice.rows.reduce((sum, row) => sum + toNumber(row.pcs), 0)}</td>
      <td>${totalCts.toFixed(2)}</td>
      <td>-</td>
      <td>${totalAmount.toFixed(2)}</td>
      <td></td>
    </tr>`;
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

function generateRows() {
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
}

function fixListPanelMarkup() {
  const panels = document.querySelectorAll('.list-panel');
  panels.forEach(panel => {
    const title = panel.querySelector('h4').textContent.toLowerCase().replace(/ /g, '_');
    panel.dataset.list = title;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  fixListPanelMarkup();
  loadLists();
  initPageNavigation();
  initEventListeners();
});
