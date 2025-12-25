// Background service worker

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'triggerSave'
        }).catch(() => {
          // Content script not available on this page
        });
      }
    });
  }
});

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-magpie',
    title: 'Save to Magpie',
    contexts: ['selection']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-to-magpie' && tab?.id && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showTooltip',
      selectedText: info.selectionText,
      pageUrl: info.pageUrl
    }).catch(() => {
      // Content script not available - save to "Unsorted" file as fallback
      const quote = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        text: info.selectionText,
        url: info.pageUrl || tab.url,
        title: tab.title || 'Unknown',
        savedAt: new Date().toISOString()
      };
      chrome.storage.local.get(['files'], (result) => {
        const files = result.files || {};
        if (!files['Unsorted']) {
          files['Unsorted'] = {
            name: 'Unsorted',
            createdAt: new Date().toISOString(),
            quotes: []
          };
        }
        files['Unsorted'].quotes.push(quote);
        chrome.storage.local.set({ files });
      });
    });
  }
});
