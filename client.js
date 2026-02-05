import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm';

const supabaseUrl = window.SUPABASE_URL;
const supabaseKey = window.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const LISTS = ['lot_names', 'shapes', 'sizes', 'descriptions', 'grades'];
const cache = {};

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

function generateRows() {
  const allInputs = document.querySelectorAll('input, select');
  let rowCountInput = null;

  for (const input of allInputs) {
    if (input.placeholder === 'Enter rows' || (input.type === 'text' && input.value === '1')) {
      if (input.closest('.form-grid') && input.previousElementSibling?.textContent === 'How Many Rows') {
        rowCountInput = input;
        break;
      }
    }
  }

  const rowCount = rowCountInput ? parseInt(rowCountInput.value) || 1 : 1;
  const tableBody = document.querySelector('.table-body');

  const baseGrade = document.querySelector('select[data-saved-list="grades"]').value;
  const description = document.querySelector('select[data-saved-list="descriptions"]').value;
  const shape = document.querySelector('select[data-saved-list="shapes"]').value;
  const size = document.querySelector('select[data-saved-list="sizes"]').value;

  let rows = '';
  for (let i = 0; i < rowCount; i++) {
    rows += `
      <div class="table-row" data-row-id="${Date.now()}-${i}">
        <span class="cell"></span>
        <span class="cell"></span>
        <span class="cell"></span>
        <span class="cell"></span>
        <span class="cell"></span>
        <span class="cell"></span>
        <span class="cell editable" contenteditable="true">${baseGrade !== '-- Select --' ? baseGrade : ''}</span>
        <span class="cell editable" contenteditable="true">${description !== '-- Select --' ? description : ''}</span>
        <span class="cell editable" contenteditable="true">${shape !== '-- Select --' ? shape : ''}</span>
        <span class="cell editable" contenteditable="true">${size !== '-- Select --' ? size : ''}</span>
        <span class="cell editable" contenteditable="true">0</span>
        <span class="cell editable" contenteditable="true">0</span>
        <span class="cell editable" contenteditable="true">0</span>
        <span class="cell editable" contenteditable="true"></span>
        <span class="cell"><button class="small-button" data-action="delete">Delete</button></span>
      </div>
    `;
  }

  tableBody.innerHTML = rows + `<div class="row-count">${rowCount} row(s)</div>`;

  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.table-row').remove();
      updateRowCount();
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

function initEventListeners() {
  document.querySelector('.primary-button').addEventListener('click', generateRows);

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
  initEventListeners();
});
