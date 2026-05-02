# MOC Sync

Automatically moves notes to their MOC folder based on the `up` frontmatter property.

## What It Does

When you set the `up` property in a note's YAML frontmatter and save, the note automatically moves to the matching MOC folder.

## Example

```yaml
---
up: "[[Money MOC]]"
---
```

If a folder named `Money MOC/` exists, the note moves there automatically.

## Requirements

1. Note has `up: "[[MOC Name]]"` in frontmatter
2. A folder with that name exists (e.g., `Money MOC/`)
3. Save the note to trigger the move

## Features

- **Auto-sync**: Moves notes when `up` property changes and note is saved
- **Manual sync**: Command to sync all vault notes at once
- **Settings**: Configure behavior via Settings tab

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-sync enabled | On | Move notes automatically on save |
| Show notifications | On | Display notice when file moves |
| Auto-sync on plugin load | Off | Scan all notes on startup |

## Commands

- **MOC Sync: Sync all notes to MOC folders** - Manual sync all notes

## Supported Formats

```yaml
up: "[[Money MOC]]"           # Wiki-link format (recommended)
up: "Money MOC"              # Bare name
up: "[[Finance/Money MOC]]"  # Nested path
```

## Installation

1. Copy `moc-sync/` folder to `.obsidian/plugins/`
2. Restart Obsidian
3. Enable in Community Plugins

## Files

```
moc-sync/
├── manifest.json    # Plugin metadata
├── main.js        # Compiled plugin
├── README.md     
├── AI_SUMMARY.md  # Developer documentation
└── src/
    ├── main.ts    # Source
    └── settings.ts
```

## For Developers

### Build

```bash
npm install
npm run build
```

### Trigger Event

The plugin listens to `app.metadataCache.on('changed', ...)` which fires when Obsidian re-indexes a file's metadata after save.

### Key Implementation Details

- Uses `metadataCache.on('changed')` NOT `vault.on('modify')` for precise frontmatter detection
- Finds folders by name using `vault.getAllLoadedFiles()` rather than `getAbstractFileByPath()` to handle external folder creation
- Sanitizes MOC names to handle zero-width characters

## TODOs

For example: When there is a folder "Sport" within "Personal MOC", but this folder does not contain a "Sport Note" yet. When I create a new note it will be automatically created in "0 Inbox MOC". Now when I change the uplink of this note to "Personal MOC", it should actually not move into "Personal MOC", but instead move into "Sport", because there is a Sport Directoriy under "5 Personal MOC" which matches the current file name.