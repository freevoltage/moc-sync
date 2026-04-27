import { App, Plugin, TFile, TFolder, Notice } from 'obsidian';
import { MOCSyncSettings, DEFAULT_SETTINGS, MOCSyncSettingTab } from './settings';

export default class MOCSyncPlugin extends Plugin {
	settings: MOCSyncSettings;

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.metadataCache.on('changed', this.handleMetadataChange.bind(this))
		);

		this.addCommand({
			id: 'sync-all-notes',
			name: 'Sync all notes to MOC folders',
			callback: async () => {
				if (this.settings.showNotifications) {
					new Notice('Syncing all notes...');
				}
				await this.syncAllNotes();
				if (this.settings.showNotifications) {
					new Notice('Sync complete');
				}
			}
		});

		this.addSettingTab(new MOCSyncSettingTab(this.app, this));

		if (this.settings.syncOnLoad) {
			await this.syncAllNotes();
		}

		new Notice('MOC Sync plugin loaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MOCSyncSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async handleMetadataChange(file: TFile, data: string, cache: any): Promise<void> {
		if (!this.settings.autoSyncEnabled) {
			return;
		}

		if (!(file instanceof TFile) || file.extension !== 'md') {
			return;
		}

		const frontmatter = this.parseFrontmatter(data);
		if (!frontmatter || !frontmatter.up) {
			return;
		}

		const targetMOC = this.extractMOCName(frontmatter.up);
		if (!targetMOC) {
			return;
		}

		const sanitizedMOC = targetMOC
			.replace(/[\u200B-\u200D\uFEFF]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		const targetFolder = this.findFolderByName(sanitizedMOC);
		if (!targetFolder || targetFolder instanceof TFile) {
			return;
		}

		const targetFolderPath = targetFolder.path + '/';
		const expectedPath = targetFolderPath + file.name;
		const currentPath = file.path;

		if (currentPath === expectedPath) {
			return;
		}

		try {
			await this.app.vault.rename(file, expectedPath);
			if (this.settings.showNotifications) {
				new Notice(`Moved ${file.name} -> ${targetFolderPath}`);
			}
		} catch (error) {
			console.error(`[MOC Sync] Failed to move file:`, error);
		}
	}

	async syncAllNotes(): Promise<void> {
		const allFiles = this.app.vault.getAllLoadedFiles();
		
		for (const file of allFiles) {
			if (file instanceof TFile && file.extension === 'md') {
				try {
					const data = await this.app.vault.read(file);
					const frontmatter = this.parseFrontmatter(data);
					
					if (frontmatter && frontmatter.up) {
						const targetMOC = this.extractMOCName(frontmatter.up);
						if (!targetMOC) continue;

						const sanitizedMOC = targetMOC
							.replace(/[\u200B-\u200D\uFEFF]/g, '')
							.replace(/\s+/g, ' ')
							.trim();

						const targetFolder = this.findFolderByName(sanitizedMOC);
						if (!targetFolder || targetFolder instanceof TFile) continue;

						const targetFolderPath = targetFolder.path + '/';
						const expectedPath = targetFolderPath + file.name;
						const currentPath = file.path;

						if (currentPath !== expectedPath) {
							await this.app.vault.rename(file, expectedPath);
							if (this.settings.showNotifications) {
								new Notice(`Moved ${file.name} -> ${targetFolderPath}`);
							}
						}
					}
				} catch (error) {
					console.error(`[MOC Sync] Error syncing ${file.name}:`, error);
				}
			}
		}
	}

	findFolderByName(folderName: string): TFolder | null {
		const allFiles = this.app.vault.getAllLoadedFiles();
		
		const found = allFiles.find(f => {
			if (f instanceof TFolder) {
				const normalizedName = f.name.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
				const normalizedSearch = folderName.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
				return normalizedName === normalizedSearch;
			}
			return false;
		});

		return found instanceof TFolder ? found : null;
	}

	parseFrontmatter(data: string): Record<string, string> | null {
		const match = data.match(/^---\n([\s\S]*?)\n---/);
		if (!match || !match[1]) {
			return null;
		}

		const frontmatter: Record<string, string> = {};
		const lines = match[1].split('\n');

		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex === -1) {
				continue;
			}

			const key = line.slice(0, colonIndex).trim();
			let value = line.slice(colonIndex + 1).trim();

			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			} else if (value.startsWith("'") && value.endsWith("'")) {
				value = value.slice(1, -1);
			}

			frontmatter[key] = value;
		}

		return frontmatter;
	}

	extractMOCName(upValue: string): string | null {
		const wikiLinkMatch = upValue.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (wikiLinkMatch && wikiLinkMatch[1]) {
			return wikiLinkMatch[1].trim();
		}

		const bareMatch = upValue.match(/^([^\s]+)$/);
		if (bareMatch && bareMatch[1]) {
			return bareMatch[1].trim();
		}

		return null;
	}
}