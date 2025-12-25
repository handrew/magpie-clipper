// Full page quotes viewer

let files = {};
let allQuotes = [];
let filteredQuotes = [];
let selectedQuotes = new Set();
let deleteCallback = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadFiles();
  buildQuotesList();
  populateFileFilter();
  renderQuotes();
  setupEventListeners();
}

async function loadFiles() {
  const data = await chrome.storage.local.get('files');
  files = data.files || {};

  // Flatten all quotes with file info
  allQuotes = [];
  Object.entries(files).forEach(([fileName, file]) => {
    file.quotes.forEach(quote => {
      allQuotes.push({
        ...quote,
        fileName
      });
    });
  });

  // Sort by date, newest first
  allQuotes.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  filteredQuotes = [...allQuotes];
}

function populateFileFilter() {
  const select = document.getElementById('fileFilter');
  const fileNames = Object.keys(files).sort();

  select.innerHTML = '<option value="">All files</option>';
  fileNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} (${files[name].quotes.length})`;
    select.appendChild(option);
  });
}

function buildQuotesList() {
  document.getElementById('quoteCount').textContent =
    `${allQuotes.length} quote${allQuotes.length !== 1 ? 's' : ''}`;
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('fileFilter').addEventListener('change', handleFilter);
  document.getElementById('exportAll').addEventListener('click', exportAll);
  document.getElementById('batchDelete').addEventListener('click', handleBatchDelete);
  document.getElementById('deleteAll').addEventListener('click', handleDeleteAll);
  document.getElementById('modalCancel').addEventListener('click', hideModal);
  document.getElementById('modalConfirm').addEventListener('click', confirmDelete);
  document.querySelector('.modal-backdrop').addEventListener('click', hideModal);
}

function handleDeleteAll() {
  const totalQuotes = allQuotes.length;
  if (totalQuotes === 0) return;

  showModal(
    'Delete everything?',
    `This will permanently delete all ${totalQuotes} quotes.`,
    async () => {
      await chrome.storage.local.set({ files: {} });
      files = {};
      allQuotes = [];
      filteredQuotes = [];
      selectedQuotes.clear();
      buildQuotesList();
      populateFileFilter();
      renderQuotes();
    }
  );
}

function handleSearch() {
  applyFilters();
}

function handleFilter() {
  applyFilters();
}

function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const fileFilter = document.getElementById('fileFilter').value;

  filteredQuotes = allQuotes.filter(quote => {
    const matchesSearch = !searchTerm ||
      quote.text.toLowerCase().includes(searchTerm) ||
      quote.title?.toLowerCase().includes(searchTerm) ||
      quote.fileName.toLowerCase().includes(searchTerm);

    const matchesFile = !fileFilter || quote.fileName === fileFilter;

    return matchesSearch && matchesFile;
  });

  renderQuotes();
}

function renderQuotes() {
  const container = document.getElementById('quotesList');
  const emptyState = document.getElementById('emptyState');

  if (filteredQuotes.length === 0) {
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  emptyState.classList.add('hidden');

  container.innerHTML = filteredQuotes.map(quote => `
    <div class="quote-card" data-id="${quote.id}" data-file="${quote.fileName}">
      <div class="quote-header">
        <label class="checkbox-wrapper">
          <input type="checkbox" class="quote-checkbox" data-id="${quote.id}" ${selectedQuotes.has(quote.id) ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
        <span class="quote-file">${escapeHtml(quote.fileName)}</span>
        <span class="quote-date">${formatDate(quote.savedAt)}</span>
        <button class="btn-icon btn-icon-danger" data-action="delete" data-id="${quote.id}" data-file="${quote.fileName}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="quote-text">${escapeHtml(quote.text)}</div>
      <div class="quote-source">
        <a href="${escapeHtml(quote.url)}" target="_blank">${escapeHtml(quote.title || quote.url)}</a>
      </div>
    </div>
  `).join('');

  // Event listeners
  container.querySelectorAll('.quote-checkbox').forEach(el => {
    el.addEventListener('change', handleCheckbox);
  });

  container.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', handleDeleteQuote);
  });

  updateBatchButton();
}

function handleCheckbox(e) {
  const id = e.target.dataset.id;
  if (e.target.checked) {
    selectedQuotes.add(id);
  } else {
    selectedQuotes.delete(id);
  }
  updateBatchButton();
}

function updateBatchButton() {
  const btn = document.getElementById('batchDelete');
  if (selectedQuotes.size > 0) {
    btn.classList.remove('hidden');
    btn.textContent = `Delete Selected (${selectedQuotes.size})`;
  } else {
    btn.classList.add('hidden');
  }
}

function handleDeleteQuote(e) {
  const id = e.currentTarget.dataset.id;
  const fileName = e.currentTarget.dataset.file;

  showModal('Delete quote?', 'This will permanently delete this quote.', async () => {
    await deleteQuote(fileName, id);
  });
}

function handleBatchDelete() {
  const count = selectedQuotes.size;
  showModal(
    `Delete ${count} quote${count !== 1 ? 's' : ''}?`,
    'This will permanently delete all selected quotes.',
    async () => {
      for (const id of selectedQuotes) {
        const quote = allQuotes.find(q => q.id === id);
        if (quote) {
          await deleteQuote(quote.fileName, id, false);
        }
      }
      selectedQuotes.clear();
      await loadFiles();
      buildQuotesList();
      populateFileFilter();
      applyFilters();
    }
  );
}

async function deleteQuote(fileName, quoteId, refresh = true) {
  if (files[fileName]) {
    files[fileName].quotes = files[fileName].quotes.filter(q => q.id !== quoteId);
    if (files[fileName].quotes.length === 0) {
      delete files[fileName];
    }
    await chrome.storage.local.set({ files });

    if (refresh) {
      await loadFiles();
      buildQuotesList();
      populateFileFilter();
      applyFilters();
    }
  }
}

function exportAll() {
  const fileNames = Object.keys(files);
  if (fileNames.length === 0) return;

  fileNames.forEach(fileName => {
    const file = files[fileName];
    const markdown = generateMarkdown(fileName, file);
    downloadFile(`${fileName}.md`, markdown);
  });
}

function generateMarkdown(fileName, file) {
  let md = `# ${fileName}\n\n`;

  file.quotes.forEach(quote => {
    md += '---\n\n';
    md += `> ${quote.text.split('\n').join('\n> ')}\n\n`;
    md += `**Source:** [${quote.title || 'Link'}](${quote.url})\n`;
    md += `**Saved:** ${formatDateLong(quote.savedAt)}\n\n`;
  });

  return md;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showModal(title, message, callback) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;
  document.getElementById('deleteModal').classList.remove('hidden');
  deleteCallback = callback;
}

function hideModal() {
  document.getElementById('deleteModal').classList.add('hidden');
  deleteCallback = null;
}

function confirmDelete() {
  if (deleteCallback) {
    deleteCallback();
  }
  hideModal();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
