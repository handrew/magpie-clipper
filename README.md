# Magpie

A Chrome extension for collecting and saving text highlights to markdown files. All data stays local on your machine.

## Installation

After cloning this repo:

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this folder.

## Usage

### Save a highlight

1. Select text on any webpage
2. Press `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Windows/Linux)
   - Or right-click and select **Save to Magpie**
3. Type a file name or select an existing one
4. Press Enter to save

### Manage your quotes

- Click the Magpie icon in your toolbar to see saved files
- Click **View All** to open the full-page quote browser
- Search and filter quotes by file
- Delete individual quotes or entire files
- Batch select and delete multiple items

### Export

- Click **Export** to download all files as markdown
- Each file exports as `filename.md` with full metadata:
  - The quoted text
  - Source URL and page title
  - Date saved

## Data Storage

All quotes are stored locally in Chrome's storage. Nothing is sent to any server.
