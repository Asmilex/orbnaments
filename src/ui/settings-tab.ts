import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
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
			.setDesc("Select a secret from SecretStorage containing your SteamGridDB API key.")
			.addComponent(
				(el) =>
					new SecretComponent(this.app, el)
						.setValue(this.plugin.settings.steamGridDbSecretName)
						.onChange(async (value) => {
							this.plugin.settings.steamGridDbSecretName = value;
							await this.plugin.saveSettings();
						}),
			);
	}
}
