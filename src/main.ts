import { App, Plugin, TFile, TFolder, Notice } from 'obsidian';
import { MOCSyncSettings, DEFAULT_SETTINGS, MOCSyncSettingTab } from './settings';

type SyncResult = 'moved' | 'already_in_place' | 'no_up_property' | 'no_moc_found' | 'skipped_folder_note' | 'skipped_excluded_directory' | 'error';

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

		this.addCommand({
			id: 'sync-this-note',
			name: 'Sync this note to MOC folder',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice('No active file');
					return;
				}
				if (!(activeFile instanceof TFile) || activeFile.extension !== 'md') {
					new Notice('Not a Markdown file');
					return;
				}
				const result = await this.syncNoteToMOC(activeFile, true);
				if (!this.settings.showNotifications) return;
				switch (result) {
					case 'moved':
						new Notice(`Moved ${activeFile.name}`);
						break;
					case 'already_in_place':
						new Notice('Already in correct folder');
						break;
					case 'no_up_property':
						new Notice('No up property found');
						break;
					case 'no_moc_found':
						new Notice('MOC folder not found');
						break;
					case 'skipped_folder_note':
						new Notice('Folder notes cannot be moved');
						break;
					case 'skipped_excluded_directory':
						new Notice('File is in excluded directory');
						break;
					case 'error':
						new Notice('Error moving file');
						break;
				}
			}
		});

		this.addCommand({
			id: 'sync-preview',
			name: 'Preview sync results',
			callback: async () => {
				await this.previewSync();
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

	async syncNoteToMOC(file: TFile, showNotification: boolean = true): Promise<SyncResult> {
		if (this.isFolderNote(file)) {
			return 'skipped_folder_note';
		}

		if (this.isInExcludedDirectory(file)) {
			return 'skipped_excluded_directory';
		}

		let data: string;
		try {
			data = await this.app.vault.read(file);
		} catch {
			return 'error';
		}

		const frontmatter = this.parseFrontmatter(data);
		if (!frontmatter || !frontmatter.up) {
			return 'no_up_property';
		}

		const targetMOC = this.extractMOCName(frontmatter.up);
		if (!targetMOC) {
			return 'no_up_property';
		}

		const sanitizedMOC = targetMOC
			.replace(/[\u200B-\u200D\uFEFF]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		const targetFolder = this.findFolderByName(sanitizedMOC);
		if (!targetFolder || targetFolder instanceof TFile) {
			return 'no_moc_found';
		}

		const matchingSubfolder = this.findSubfolderMatchingBasename(targetFolder, file);
		if (matchingSubfolder) {
			return this.moveFileToFolder(file, matchingSubfolder, showNotification);
		}

		if (this.settings.autoCreateFolders) {
			const shouldCreate = this.shouldAutoCreateFolder(file, targetFolder);
			if (shouldCreate) {
				const newFolder = await this.createFolder(targetFolder.path + '/' + file.basename);
				if (newFolder) {
					return this.moveFileToFolder(file, newFolder, showNotification);
				}
			}
		}

		return this.moveFileToFolder(file, targetFolder, showNotification);
	}

	async moveFileToFolder(file: TFile, targetFolder: TFolder, showNotification: boolean): Promise<SyncResult> {
		const targetFolderPath = targetFolder.path + '/';
		const expectedPath = targetFolderPath + file.name;
		const currentPath = file.path;

		if (currentPath === expectedPath) {
			return 'already_in_place';
		}

		try {
			await this.app.vault.rename(file, expectedPath);
			if (showNotification && this.settings.showNotifications) {
				new Notice(`Moved ${file.name} -> ${targetFolderPath}`);
			}
			return 'moved';
		} catch (error) {
			console.error(`[MOC Sync] Failed to move file:`, error);
			return 'error';
		}
	}

	shouldAutoCreateFolder(file: TFile, targetFolder: TFolder): boolean {
		const allFiles = this.app.vault.getAllLoadedFiles();
		const basename = file.basename.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

		for (const f of allFiles) {
			if (f instanceof TFolder && f.path.startsWith(targetFolder.path + '/')) {
				const normalizedName = f.name.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
				if (normalizedName === basename) {
					return true;
				}
			}
		}
		return false;
	}

	async createFolder(path: string): Promise<TFolder | null> {
		try {
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (folder instanceof TFolder) {
				return folder;
			}
			const created = await this.app.vault.createFolder(path);
			return created instanceof TFolder ? created : null;
		} catch (error) {
			console.error(`[MOC Sync] Failed to create folder:`, error);
			return null;
		}
	}

	async handleMetadataChange(file: TFile, data: string, cache: any): Promise<void> {
		if (!this.settings.autoSyncEnabled) {
			return;
		}

		if (!(file instanceof TFile) || file.extension !== 'md') {
			return;
		}

		if (this.isFolderNote(file)) {
			return;
		}

		if (this.isInExcludedDirectory(file)) {
			return;
		}

		const frontmatter = this.parseFrontmatter(data);
		if (!frontmatter || !frontmatter.up) {
			return;
		}

		await this.syncNoteToMOC(file, true);
	}

	async syncAllNotes(): Promise<void> {
		const allFiles = this.app.vault.getAllLoadedFiles();
		
		for (const file of allFiles) {
			if (file instanceof TFile && file.extension === 'md') {
				if (this.isFolderNote(file)) {
					continue;
				}

				if (this.isInExcludedDirectory(file)) {
					continue;
				}

				try {
					const data = await this.app.vault.read(file);
					const frontmatter = this.parseFrontmatter(data);
					
					if (frontmatter && frontmatter.up) {
						await this.syncNoteToMOC(file, false);
					}
				} catch (error) {
					console.error(`[MOC Sync] Error syncing ${file.name}:`, error);
				}
			}
		}
	}

	async previewSync(): Promise<void> {
		const allFiles = this.app.vault.getAllLoadedFiles();
		const results: { file: TFile; target: string; status: string }[] = [];
		let movedCount = 0;
		let alreadyInPlaceCount = 0;
		let noUpCount = 0;
		let noMocCount = 0;
		let skippedFolderNoteCount = 0;
		let skippedExcludedCount = 0;
		let errorCount = 0;

		console.log('[MOC Sync] Preview Results:');

		for (const file of allFiles) {
			if (file instanceof TFile && file.extension === 'md') {
				if (this.isFolderNote(file)) {
					console.log(`- ${file.name}: Folder note skipped`);
					skippedFolderNoteCount++;
					continue;
				}

				if (this.isInExcludedDirectory(file)) {
					console.log(`- ${file.name}: Excluded directory skipped`);
					skippedExcludedCount++;
					continue;
				}

				try {
					const data = await this.app.vault.read(file);
					const frontmatter = this.parseFrontmatter(data);

					if (!frontmatter || !frontmatter.up) {
						console.log(`- ${file.name}: No up property`);
						noUpCount++;
						continue;
					}

					const targetMOC = this.extractMOCName(frontmatter.up);
					if (!targetMOC) {
						console.log(`- ${file.name}: No up property`);
						noUpCount++;
						continue;
					}

					const sanitizedMOC = targetMOC
						.replace(/[\u200B-\u200D\uFEFF]/g, '')
						.replace(/\s+/g, ' ')
						.trim();

					const targetFolder = this.findFolderByName(sanitizedMOC);
					if (!targetFolder || targetFolder instanceof TFile) {
						console.log(`- ${file.name}: MOC folder not found ("${sanitizedMOC}")`);
						noMocCount++;
						continue;
					}

					const matchingSubfolder = this.findSubfolderMatchingBasename(targetFolder, file);
					const finalTargetFolder = matchingSubfolder || targetFolder;
					const finalTargetPath = finalTargetFolder.path + '/';
					const expectedPath = finalTargetPath + file.name;

					if (file.path === expectedPath) {
						console.log(`- ${file.name}: Already in correct folder`);
						alreadyInPlaceCount++;
						continue;
					}

					console.log(`✓ ${file.name} -> ${finalTargetPath}`);
					movedCount++;
					results.push({ file, target: finalTargetPath, status: 'moved' });
				} catch (error) {
					console.log(`- ${file.name}: Error`);
					errorCount++;
				}
			}
		}

		const summary = ['Preview: '];
		if (movedCount > 0) summary.push(`Would move: ${movedCount}`);
		if (alreadyInPlaceCount > 0) summary.push(`${alreadyInPlaceCount} already in place`);
		if (noUpCount > 0) summary.push(`${noUpCount} no up`);
		if (noMocCount > 0) summary.push(`${noMocCount} moc not found`);
		if (skippedFolderNoteCount > 0) summary.push(`${skippedFolderNoteCount} folder notes`);
		if (skippedExcludedCount > 0) summary.push(`${skippedExcludedCount} excluded`);
		if (errorCount > 0) summary.push(`${errorCount} errors`);

		const noticeText = summary.join(', ');
		new Notice(noticeText || 'Preview: No files to sync');
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

	findSubfolderMatchingBasename(parentFolder: TFolder, file: TFile): TFolder | null {
		const allFiles = this.app.vault.getAllLoadedFiles();
		const targetBasename = file.basename;

		const found = allFiles.find(f => {
			if (f instanceof TFolder) {
				const normalizedName = f.name.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
				const normalizedTarget = targetBasename.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
				return normalizedName === normalizedTarget && f.path.startsWith(parentFolder.path + '/');
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

	isFolderNote(file: TFile): boolean {
		const parentPath = file.path.replace(/[/]?[^/]+$/, '').replace(/^$/, '.');
		const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
		if (parentFolder && parentFolder instanceof TFolder) {
			return file.basename === parentFolder.name;
		}
		return false;
	}

	isInExcludedDirectory(file: TFile): boolean {
		const excludedDirs = this.settings.excludedDirectories.trim();
		if (!excludedDirs) {
			return false;
		}

		const filePath = file.path;
		const pathParts = filePath.split('/');
		const parentFolderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';

		const patterns = excludedDirs.split(',').map(p => p.trim()).filter(p => p.length > 0);

		for (const pattern of patterns) {
			const isRegex = pattern.startsWith('/') && pattern.endsWith('/');

			if (isRegex) {
				const regexPattern = pattern.slice(1, -1);
				try {
					const regex = new RegExp(regexPattern, 'i');
					if (regex.test(filePath) || regex.test(parentFolderName || '')) {
						return true;
					}
				} catch (e) {
					console.warn(`[MOC Sync] Invalid regex pattern: ${pattern}`);
				}
			} else {
				const normalizedPattern = pattern.toLowerCase();
				if (filePath.toLowerCase().includes(normalizedPattern)) {
					return true;
				}
			}
		}

		return false;
	}
}