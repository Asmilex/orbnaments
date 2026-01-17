import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	file,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	MyPluginSettings,
	SampleSettingTab,
} from "./settings";

// Remember to rename these classes and interfaces!

export default class HelloWorldPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.debug("Orbnaments loading...");

		await this.loadSettings();

		this.addCommand({
			id: "remove-syncthing-conflict",
			// Syncthing is a proper name.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			name: "Remove Syncthing's conflicts",
			callback: async () => {
				try {
					const count = await this.removeSyncConflicts();
					if (count === 0) {
						new Notice("No sync conflict files found");
					} else {
						new Notice(`Removed ${count} sync conflict file(s)`);
					}
				} catch (err) {
					new Notice(
						`Error removing sync conflict files: ${err.message}`,
					);
					console.error(err);
				}
			},
		});
	}

	onunload() {
		console.debug("Orbnaments unloading");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MyPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * gather all *.sync-conflict* files in the vault and deletes/trashes them
	 * @returns the number of files removed
	 */
	async removeSyncConflicts(): Promise<number> {
		const files = this.app.vault.getFiles();
		const syncConflictFiles = files.filter((file) =>
			file.name.includes(".sync-conflict"),
		);

		if (syncConflictFiles.length === 0) {
			return 0;
		}

		// Always trash each sync conflict file
		const promises = syncConflictFiles.map((file) => {
			return this.app.fileManager.trashFile(file);
		});

		await Promise.all(promises);
		return syncConflictFiles.length;
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
