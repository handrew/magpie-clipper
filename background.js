// Background service worker

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
    });
  }
});
