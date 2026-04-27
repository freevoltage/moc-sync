import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

export interface MOCSyncSettings {
	autoSyncEnabled: boolean;
	showNotifications: boolean;
	syncOnLoad: boolean;
}

export const DEFAULT_SETTINGS: MOCSyncSettings = {
	autoSyncEnabled: true,
	showNotifications: true,
	syncOnLoad: false,
};

export class MOCSyncSettingTab extends PluginSettingTab {
	pluginRef: any;

	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
		this.pluginRef = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		
		const settings = this.pluginRef.settings;

		new Setting(containerEl)
			.setName('Auto-sync enabled')
			.setDesc('Automatically sync notes when the up property changes')
			.addToggle((toggle: any) => toggle
				.setValue(settings.autoSyncEnabled)
				.onChange((value: boolean) => {
					settings.autoSyncEnabled = value;
					this.pluginRef.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show notifications')
			.setDesc('Show a notification when a file is moved')
			.addToggle((toggle: any) => toggle
				.setValue(settings.showNotifications)
				.onChange((value: boolean) => {
					settings.showNotifications = value;
					this.pluginRef.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-sync on plugin load')
			.setDesc('⚠️ This will scan all vault notes when the plugin loads. May be slow for large vaults. Use the "Sync all notes" command instead for manual sync.')
			.addToggle((toggle: any) => toggle
				.setValue(settings.syncOnLoad)
				.onChange((value: boolean) => {
					settings.syncOnLoad = value;
					this.pluginRef.saveSettings();
				}));
	}
}