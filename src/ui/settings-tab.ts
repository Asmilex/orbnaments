import { App, PluginSettingTab, Setting } from "obsidian";
import type OrbnamentsPlugin from "../main";

export class OrbnamentsSettingTab extends PluginSettingTab {
	plugin: OrbnamentsPlugin;

	constructor(app: App, plugin: OrbnamentsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("SteamGridDB API Key")
			.setDesc("API key for downloading videogame covers.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.steamGridDbApiKey)
					.onChange(async (value) => {
						this.plugin.settings.steamGridDbApiKey = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
