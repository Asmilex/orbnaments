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

		new Setting(containerEl).setName("Places").setHeading();

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Filling a note from the map sends its name to these OpenStreetMap services, which are public by default. Both can be self-hosted. Place types are the categories under the places category; the categories folder above applies here too.",
		});

		const textSetting = (
			name: string,
			desc: string,
			placeholder: string,
			get: () => string,
			set: (value: string) => void,
		) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((text) =>
					text
						.setPlaceholder(placeholder)
						.setValue(get())
						.onChange(async (value) => {
							set(value.trim());
							await this.plugin.saveSettings();
						}),
				);

		textSetting(
			"Search service",
			"Photon, used to search as you type.",
			"https://photon.komoot.io",
			() => this.plugin.settings.placesSearchUrl,
			(value) => (this.plugin.settings.placesSearchUrl = value || "https://photon.komoot.io"),
		);
		textSetting(
			"Details service",
			"Nominatim, used for a place's tags and address.",
			"https://nominatim.openstreetmap.org",
			() => this.plugin.settings.placesDetailsUrl,
			(value) => (this.plugin.settings.placesDetailsUrl = value || "https://nominatim.openstreetmap.org"),
		);
		textSetting(
			"Address language",
			"Language for the names of towns, regions and countries.",
			"es",
			() => this.plugin.settings.placesLanguage,
			(value) => (this.plugin.settings.placesLanguage = value),
		);
		textSetting(
			"Places category",
			"The category every place type is filed under, directly or not.",
			"lugares",
			() => this.plugin.settings.placesCategory,
			(value) => (this.plugin.settings.placesCategory = value || "lugares"),
		);
		textSetting(
			"Folder",
			"Empty notes filled from the map move here. Leave empty to keep them where they are.",
			"Lugares",
			() => this.plugin.settings.placesFolder,
			(value) => (this.plugin.settings.placesFolder = value),
		);
	}
}
