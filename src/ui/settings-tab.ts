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

		new Setting(containerEl).setName("Wikipedia").setHeading();

		new Setting(containerEl)
			.setName("Language")
			.setDesc("Language code of the wiki the articles come from.")
			.addText((text) =>
				text
					// Language codes are lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("en")
					.setValue(this.plugin.settings.wikipediaLanguage)
					.onChange(async (value) => {
						this.plugin.settings.wikipediaLanguage = value.trim() || "en";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Alias language")
			.setDesc("The article's title in this language becomes an alias, and note titles written in it are translated before looking them up. Leave empty to skip.")
			.addText((text) =>
				text
					// Language codes are lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("es")
					.setValue(this.plugin.settings.wikipediaAliasLanguage)
					.onChange(async (value) => {
						this.plugin.settings.wikipediaAliasLanguage = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Folder")
			.setDesc("Filled notes move here. Leave empty to keep them where they are.")
			.addText((text) =>
				text
					.setPlaceholder("Clippings")
					.setValue(this.plugin.settings.wikipediaFolder)
					.onChange(async (value) => {
						this.plugin.settings.wikipediaFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Categories folder")
			.setDesc("Filled notes get filed under the categories their first paragraphs link to. Categories are the notes in this folder, plus any filed under [[categories]].")
			.addText((text) =>
				text
					.setPlaceholder("Categorías")
					.setValue(this.plugin.settings.wikipediaCategoryFolder)
					.onChange(async (value) => {
						this.plugin.settings.wikipediaCategoryFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}
}
