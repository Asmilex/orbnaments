import { Notice, Plugin } from "obsidian";
import { Result } from "typescript-result";

// Error classes for different failure scenarios
class SyncConflictError extends Error {
	readonly type = "sync-conflict-error";
	cause?: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "SyncConflictError";
		this.cause = cause;
	}
}

export default class HelloWorldPlugin extends Plugin {
	async onload() {
		console.debug("Orbnaments loading...");

		this.addCommand({
			id: "remove-syncthing-conflict",
			// Syncthing is a proper name.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			name: "Remove Syncthing's conflicts",
			callback: async () => {
				const result = await this.removeSyncConflicts();

				const [count, error] = result.toTuple();

				if (error) {
					new Notice(
						`Error removing sync conflict files: ${error.message}`,
					);
					console.error(error);
					return;
				}

				if (count === 0) {
					new Notice("No sync conflict files found");
				} else {
					new Notice(`Removed ${count} sync conflict file(s)`);
				}
			},
		});
	}

	onunload() {
		console.debug("Orbnaments unloading");
	}

	/**
	 * gather all *.sync-conflict* files in the vault and deletes/trashes them
	 * @returns a Result containing the number of files removed or an error
	 */
	async removeSyncConflicts(): Promise<Result<number, SyncConflictError>> {
		return Result.try(async () => {
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
		}).mapError((error) => {
			return new SyncConflictError(
				`Failed to remove sync conflict files: ${error.message}`,
				error,
			);
		});
	}
}
