# MOC Sync - AI Agent Summary

## Plugin Overview

**Purpose**: Automatically moves Obsidian notes to their MOC folder based on the `up` frontmatter property.

## Core Functionality

When a note has `up: "[[MOC Name]]"` in YAML frontmatter and is saved, the plugin moves the note to the folder named `MOC Name/`.

## How It Works

1. **Trigger**: `app.metadataCache.on('changed', file, data, cache)` - fires when Obsidian re-indexes a file's metadata after save
2. **Parse frontmatter**: Extract `up` property from YAML between `---` delimiters
3. **Extract MOC name**: Use regex `\[\[([^\]|]+)(?:\|[^\]]+)?\]` to get name from `[[Name]]` format
4. **Find folder**: Scan `vault.getAllLoadedFiles()` for folder with matching name
5. **Move file**: Use `vault.rename(file, newPath)` to move

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Main plugin logic - onload, handleMetadataChange, syncAllNotes |
| `src/settings.ts` | Settings UI with MOCSyncSettingTab class |
| `main.js` | Compiled output (do not edit) |
| `manifest.json` | Plugin metadata |

## Important Classes/Functions

```typescript
// src/main.ts
class MOCSyncPlugin extends Plugin {
  settings: MOCSyncSettings
  async onload()           // Register events, commands, settings tab
  async handleMetadataChange(file, data, cache)  // Main logic
  async syncAllNotes()      // Manual sync all vault notes
  findFolderByName(name): TFolder | null
  parseFrontmatter(data): Record<string, string> | null
  extractMOCName(upValue): string | null
}
```

## Settings Interface

```typescript
interface MOCSyncSettings {
  autoSyncEnabled: boolean;    // Default: true
  showNotifications: boolean; // Default: true
  syncOnLoad: boolean;      // Default: false
}
```

## Supported `up` Formats

```yaml
up: "[[Money MOC]]"           # Wiki-link (recommended)
up: "Money MOC"              # Bare name
up: "[[Finance/Money MOC]]"  # Nested path
```

## Edge Cases Handled

- Missing `up` property → ignore
- Invalid `[[link]]` format → ignore via extractMOCName returning null
- Target folder doesn't exist → log, do nothing
- Already in correct folder → skip (currentPath === expectedPath)
- Zero-width characters → sanitized in extractMOCName

## Build Commands

```bash
npm install    # Install dependencies
npm run build # Compile TypeScript → main.js
```

## Trigger Event Details

The plugin uses `metadataCache.on('changed')` NOT `vault.on('modify')`:
- `modify` fires on every file write
- `metadataCache.on('changed')` fires when frontmatter is parsed
- This is more precise for frontmatter changes

## For Further Development

- Read `src/main.ts` for full implementation
- Settings tab extends `PluginSettingTab`
- Uses esbuild for TypeScript bundling
- No external APIs beyond obsidian package