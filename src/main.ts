import { Notice, Plugin } from "obsidian";

// Remember to rename these classes and interfaces!

export default class HelloWorldPlugin extends Plugin {
	async onload() {
		console.debug("Orbnaments loading...");

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
					const errorMessage =
						err instanceof Error ? err.message : String(err);
					new Notice(
						`Error removing sync conflict files: ${errorMessage}`,
					);
					console.error(err);
				}
			},
		});
	}

	onunload() {
		console.debug("Orbnaments unloading");
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

		const promises = syncConflictFiles.map((file) => {
			return this.app.fileManager.trashFile(file);
		});

		await Promise.all(promises);
		return syncConflictFiles.length;
	}
}
