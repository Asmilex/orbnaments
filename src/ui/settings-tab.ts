import { App, PluginSettingTab, Setting } from "obsidian";
import type OrbnamentsPlugin from "../main";
import { forgetBinaries } from "../commands/render-pdf/node";

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
			// SteamGridDB is a proper name.
			 
			.setName("SteamGridDB API key")
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

		new Setting(containerEl).setName("Render to PDF").setHeading();

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Needs Pandoc and Typst, plus the ilm-prima package installed under the local Typst packages folder. The remaining options live in the command's own dialog, which remembers them between runs.",
		});

		new Setting(containerEl)
			// Pandoc is a proper name.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("Pandoc path")
			.setDesc("Leave empty to look for it on the PATH.")
			.addText((text) =>
				text
					.setPlaceholder("/opt/homebrew/bin/pandoc")
					.setValue(this.plugin.settings.pdfPandocPath)
					.onChange(async (value) => {
						this.plugin.settings.pdfPandocPath = value.trim();
						forgetBinaries();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			// Typst is a proper name.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("Typst path")
			.setDesc("Leave empty to look for it on the PATH.")
			.addText((text) =>
				text
					.setPlaceholder("/opt/homebrew/bin/typst")
					.setValue(this.plugin.settings.pdfTypstPath)
					.onChange(async (value) => {
						this.plugin.settings.pdfTypstPath = value.trim();
						forgetBinaries();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Destination folder")
			.setDesc("Where the PDF files land, always outside the vault.")
			.addText((text) =>
				text
					.setPlaceholder("~/Desktop")
					.setValue(this.plugin.settings.pdfOutputFolder)
					.onChange(async (value) => {
						this.plugin.settings.pdfOutputFolder = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
