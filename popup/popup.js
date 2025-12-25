// Popup script for file manager

document.addEventListener('DOMContentLoaded', init);

let files = {};
let selectedFiles = new Set();
let deleteCallback = null;

async function init() {
  await loadFiles();
  renderFiles();
  setupEventListeners();
}

async function loadFiles() {
  const data = await chrome.storage.local.get('files');
  files = data.files || {};
}

function setupEventListeners() {
  document.getElementById('openFullPage').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('page/index.html') });
  });
  document.getElementById('exportAll').addEventListener('click', exportAllFiles);
  document.getElementById('deleteAll').addEventListener('click', handleDeleteAll);
  document.getElementById('batchDelete').addEventListener('click', handleBatchDelete);
  document.getElementById('modalCancel').addEventListener('click', hideModal);
  document.getElementById('modalConfirm').addEventListener('click', confirmDelete);
  document.querySelector('.modal-backdrop').addEventListener('click', hideModal);
}

function handleDeleteAll() {
  const fileCount = Object.keys(files).length;
  if (fileCount === 0) return;

  showModal(
    'Delete everything?',
    `This will permanently delete all ${fileCount} files and their quotes.`,
    async () => {
      await chrome.storage.local.set({ files: {} });
      files = {};
      selectedFiles.clear();
      renderFiles();
    }
  );
}

function renderFiles() {
  const fileList = document.getElementById('fileList');
  const emptyState = document.getElementById('emptyState');

  const fileNames = Object.keys(files).sort();

  if (fileNames.length === 0) {
    fileList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  fileList.classList.remove('hidden');
  emptyState.classList.add('hidden');

  fileList.innerHTML = fileNames.map(name => {
    const file = files[name];
    const quoteCount = file.quotes.length;
    const isSelected = selectedFiles.has(name);

    return `
      <div class="file-card" data-filename="${name}">
        <div class="file-header">
          <label class="checkbox-wrapper">
            <input type="checkbox" class="file-checkbox" data-filename="${name}" ${isSelected ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <div class="file-info" data-filename="${name}">
            <span class="file-name">${escapeHtml(name)}</span>
            <span class="file-count">${quoteCount} quote${quoteCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="file-actions">
            <button class="btn-icon" data-action="export" data-filename="${name}" title="Export">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="btn-icon btn-icon-danger" data-action="delete-file" data-filename="${name}" title="Delete file">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-quotes hidden" data-filename="${name}">
          ${file.quotes.map(quote => `
            <div class="quote-item" data-quote-id="${quote.id}">
              <div class="quote-text">${escapeHtml(truncate(quote.text, 150))}</div>
              <div class="quote-meta">
                <a href="${escapeHtml(quote.url)}" target="_blank" class="quote-source">${escapeHtml(truncate(quote.title || quote.url, 40))}</a>
                <span class="quote-date">${formatDate(quote.savedAt)}</span>
              </div>
              <button class="btn-icon btn-icon-small btn-icon-danger quote-delete" data-action="delete-quote" data-filename="${name}" data-quote-id="${quote.id}" title="Delete quote">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  fileList.querySelectorAll('.file-info').forEach(el => {
    el.addEventListener('click', toggleFileExpand);
  });

  fileList.querySelectorAll('.file-checkbox').forEach(el => {
    el.addEventListener('change', handleCheckboxChange);
  });

  fileList.querySelectorAll('[data-action="export"]').forEach(el => {
    el.addEventListener('click', handleExport);
  });

  fileList.querySelectorAll('[data-action="delete-file"]').forEach(el => {
    el.addEventListener('click', handleDeleteFile);
  });

  fileList.querySelectorAll('[data-action="delete-quote"]').forEach(el => {
    el.addEventListener('click', handleDeleteQuote);
  });

  updateBatchBar();
}

function toggleFileExpand(e) {
  const filename = e.currentTarget.dataset.filename;
  const quotesEl = document.querySelector(`.file-quotes[data-filename="${filename}"]`);
  const cardEl = document.querySelector(`.file-card[data-filename="${filename}"]`);

  if (quotesEl) {
    quotesEl.classList.toggle('hidden');
    cardEl.classList.toggle('expanded');
  }
}

function handleCheckboxChange(e) {
  const filename = e.target.dataset.filename;
  if (e.target.checked) {
    selectedFiles.add(filename);
  } else {
    selectedFiles.delete(filename);
  }
  updateBatchBar();
}

function updateBatchBar() {
  const batchBar = document.getElementById('batchBar');
  const selectedCount = document.getElementById('selectedCount');

  if (selectedFiles.size > 0) {
    batchBar.classList.remove('hidden');
    selectedCount.textContent = `${selectedFiles.size} selected`;
  } else {
    batchBar.classList.add('hidden');
  }
}

function handleExport(e) {
  e.stopPropagation();
  const filename = e.currentTarget.dataset.filename;
  exportFile(filename);
}

function handleDeleteFile(e) {
  e.stopPropagation();
  const filename = e.currentTarget.dataset.filename;
  showModal(
    'Delete file?',
    `This will permanently delete "${filename}" and all its quotes.`,
    () => deleteFile(filename)
  );
}

function handleDeleteQuote(e) {
  e.stopPropagation();
  const filename = e.currentTarget.dataset.filename;
  const quoteId = e.currentTarget.dataset.quoteId;
  showModal(
    'Delete quote?',
    'This will permanently delete this quote.',
    () => deleteQuote(filename, quoteId)
  );
}

function handleBatchDelete() {
  const count = selectedFiles.size;
  showModal(
    `Delete ${count} file${count !== 1 ? 's' : ''}?`,
    'This will permanently delete all selected files and their quotes.',
    async () => {
      for (const filename of selectedFiles) {
        delete files[filename];
      }
      await chrome.storage.local.set({ files });
      selectedFiles.clear();
      renderFiles();
    }
  );
}

async function deleteFile(filename) {
  delete files[filename];
  await chrome.storage.local.set({ files });
  selectedFiles.delete(filename);
  renderFiles();
}

async function deleteQuote(filename, quoteId) {
  if (files[filename]) {
    files[filename].quotes = files[filename].quotes.filter(q => q.id !== quoteId);
    if (files[filename].quotes.length === 0) {
      delete files[filename];
      selectedFiles.delete(filename);
    }
    await chrome.storage.local.set({ files });
    renderFiles();
  }
}

function exportFile(filename) {
  const file = files[filename];
  if (!file) return;

  const markdown = generateMarkdown(filename, file);
  downloadFile(`${filename}.md`, markdown);
}

function exportAllFiles() {
  const fileNames = Object.keys(files);
  if (fileNames.length === 0) return;

  fileNames.forEach(filename => {
    const file = files[filename];
    const markdown = generateMarkdown(filename, file);
    downloadFile(`${filename}.md`, markdown);
  });
}

function generateMarkdown(filename, file) {
  let md = `# ${filename}\n\n`;

  file.quotes.forEach((quote, index) => {
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

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
