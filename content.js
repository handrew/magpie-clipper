// Content script for highlight detection and floating tooltip

(function() {
  let tooltip = null;
  let selectedText = '';
  let selectionRect = null;
  let previousActiveElement = null;
  let lastMousePos = null;
  let lastSelectionRect = null;

  // Track mouse position and selection for tooltip positioning
  document.addEventListener('mouseup', (e) => {
    lastMousePos = { x: e.clientX, y: e.clientY };
    // Also capture selection rect on mouseup while it still exists
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString().trim()) {
      lastSelectionRect = selection.getRangeAt(0).getBoundingClientRect();
    }
  });

  document.addEventListener('contextmenu', (e) => {
    lastMousePos = { x: e.clientX, y: e.clientY };
    // Capture selection rect on right-click
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString().trim()) {
      lastSelectionRect = selection.getRangeAt(0).getBoundingClientRect();
    }
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle keyboard shortcut from commands API
    if (message.action === 'triggerSave') {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if (text) {
        selectedText = text;
        previousActiveElement = document.activeElement;

        if (selection.rangeCount > 0) {
          selectionRect = selection.getRangeAt(0).getBoundingClientRect();
        } else if (lastMousePos) {
          selectionRect = {
            bottom: lastMousePos.y,
            left: lastMousePos.x,
            top: lastMousePos.y
          };
        } else {
          selectionRect = {
            bottom: window.innerHeight / 2,
            left: window.innerWidth / 2 - 150,
            top: window.innerHeight / 2
          };
        }
        showTooltip();
      }
      return;
    }

    if (message.action === 'showTooltip' && message.selectedText) {
      selectedText = message.selectedText.trim();
      previousActiveElement = document.activeElement;

      // Try to get selection rect with multiple fallbacks
      const selection = window.getSelection();
      if (selection.rangeCount > 0 && selection.toString().trim()) {
        const range = selection.getRangeAt(0);
        selectionRect = range.getBoundingClientRect();
      } else if (lastSelectionRect && lastSelectionRect.width > 0) {
        // Use cached selection rect from when right-click happened
        selectionRect = lastSelectionRect;
      } else if (lastMousePos) {
        // Fallback: use last mouse position
        selectionRect = {
          bottom: lastMousePos.y,
          left: lastMousePos.x,
          top: lastMousePos.y
        };
      } else {
        // Last resort: center of viewport
        selectionRect = {
          bottom: window.innerHeight / 2,
          left: window.innerWidth / 2 - 150,
          top: window.innerHeight / 2
        };
      }
      showTooltip();
    }
  });

  function showTooltip() {
    removeTooltip();

    tooltip = document.createElement('div');
    tooltip.className = 'htmd-tooltip';
    tooltip.innerHTML = `
      <div class="htmd-tooltip-header">Save to file</div>
      <div class="htmd-tooltip-body">
        <input type="text" class="htmd-input" placeholder="Type file name or select..." autocomplete="off" />
        <div class="htmd-dropdown"></div>
      </div>
      <div class="htmd-tooltip-footer">
        <button class="htmd-btn htmd-btn-save">Save</button>
        <span class="htmd-hint">Enter to save, Esc to cancel</span>
      </div>
    `;

    document.body.appendChild(tooltip);
    positionTooltip();

    const input = tooltip.querySelector('.htmd-input');
    const dropdown = tooltip.querySelector('.htmd-dropdown');
    const saveBtn = tooltip.querySelector('.htmd-btn-save');

    // Load existing files
    loadFiles().then(files => {
      renderDropdown(files, dropdown, input);
    });

    // Focus input immediately
    input.focus();

    // Input handlers
    input.addEventListener('input', () => {
      loadFiles().then(files => {
        const filtered = files.filter(f =>
          f.toLowerCase().includes(input.value.toLowerCase())
        );
        renderDropdown(filtered, dropdown, input, input.value);
      });
    });

    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.htmd-dropdown-item');
      const activeItem = dropdown.querySelector('.htmd-dropdown-item.active');
      let activeIndex = Array.from(items).indexOf(activeItem);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (activeIndex < items.length - 1) {
          items[activeIndex]?.classList.remove('active');
          items[activeIndex + 1]?.classList.add('active');
          items[activeIndex + 1]?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeIndex > 0) {
          items[activeIndex]?.classList.remove('active');
          items[activeIndex - 1]?.classList.add('active');
          items[activeIndex - 1]?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const active = dropdown.querySelector('.htmd-dropdown-item.active');
        if (active) {
          saveToFile(active.dataset.filename);
        } else if (input.value.trim()) {
          saveToFile(input.value.trim());
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        removeTooltip();
      }
    });

    saveBtn.addEventListener('click', () => {
      const active = dropdown.querySelector('.htmd-dropdown-item.active');
      if (active) {
        saveToFile(active.dataset.filename);
      } else if (input.value.trim()) {
        saveToFile(input.value.trim());
      }
    });

    // Click outside to close
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
  }

  function positionTooltip() {
    if (!tooltip || !selectionRect) return;

    // Use fixed positioning relative to viewport
    tooltip.style.position = 'fixed';

    const tooltipRect = tooltip.getBoundingClientRect();
    let top = selectionRect.bottom + 10;
    let left = selectionRect.left;

    // Keep within viewport horizontally
    if (left + tooltipRect.width > window.innerWidth - 20) {
      left = window.innerWidth - tooltipRect.width - 20;
    }
    if (left < 10) left = 10;

    // If tooltip would go below viewport, show above selection
    if (top + tooltipRect.height > window.innerHeight - 20) {
      top = selectionRect.top - tooltipRect.height - 10;
    }
    if (top < 10) top = 10;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function renderDropdown(files, dropdown, input, filterValue = '') {
    dropdown.innerHTML = '';

    // Show "Create new" option if input has value and doesn't match existing file
    if (filterValue && !files.includes(filterValue)) {
      const createItem = document.createElement('div');
      createItem.className = 'htmd-dropdown-item htmd-create-new active';
      createItem.dataset.filename = filterValue;
      createItem.innerHTML = `<span class="htmd-icon">+</span> Create "${filterValue}"`;
      createItem.addEventListener('click', () => saveToFile(filterValue));
      dropdown.appendChild(createItem);
    }

    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'htmd-dropdown-item';
      if (!filterValue && index === 0) item.classList.add('active');
      item.dataset.filename = file;
      item.textContent = file;
      item.addEventListener('click', () => saveToFile(file));
      dropdown.appendChild(item);
    });

    if (files.length === 0 && !filterValue) {
      const empty = document.createElement('div');
      empty.className = 'htmd-dropdown-empty';
      empty.textContent = 'Type a name to create a new file';
      dropdown.appendChild(empty);
    }
  }

  async function loadFiles() {
    const data = await chrome.storage.local.get('files');
    const files = data.files || {};
    return Object.keys(files).sort();
  }

  async function saveToFile(filename) {
    if (!filename || !selectedText) return;

    // Sanitize filename
    const sanitizedName = filename.replace(/[^a-zA-Z0-9-_\s]/g, '').trim();
    if (!sanitizedName) return;

    const quote = {
      id: generateId(),
      text: selectedText,
      url: window.location.href,
      title: document.title,
      savedAt: new Date().toISOString()
    };

    const data = await chrome.storage.local.get('files');
    const files = data.files || {};

    if (!files[sanitizedName]) {
      files[sanitizedName] = {
        name: sanitizedName,
        createdAt: new Date().toISOString(),
        quotes: []
      };
    }

    files[sanitizedName].quotes.push(quote);
    await chrome.storage.local.set({ files });

    showToast(`Saved to "${sanitizedName}"`);
    removeTooltip();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'htmd-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function removeTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);

    // Restore focus to previous element
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      try {
        previousActiveElement.focus();
      } catch (e) {
        // Element may no longer be focusable
      }
    }
    previousActiveElement = null;
  }

  function handleClickOutside(e) {
    if (tooltip && !tooltip.contains(e.target)) {
      removeTooltip();
    }
  }

  function handleEscape(e) {
    if (e.key === 'Escape') {
      removeTooltip();
    }
  }
})();
