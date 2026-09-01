import { Editor, Notice, Plugin, TFile } from "obsidian";
import { Result } from "typescript-result";
import { OrbnamentsSettingTab } from "./ui/settings-tab";
import { DEFAULT_SETTINGS, OrbnamentsSettings } from "./settings";
import { downloadVideogameCovers } from "./commands/download-covers";
import { createQuoteNote } from "./commands/create-quote-note";
import { createThoughtsNote } from "./commands/create-thoughts-note";
import { createExpenseNote } from "./commands/create-expense-note";
import { openRandomQuote } from "./commands/open-random-quote";
import { moveSelectionToFootnote } from "./commands/move-selection-to-footnote";

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

class MoveAttachmentsError extends Error {
	readonly type = "move-attachments-error";
	cause?: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "MoveAttachmentsError";
		this.cause = cause;
	}
}

export default class OrbnamentsPlugin extends Plugin {
	settings!: OrbnamentsSettings;

	async onload() {
		console.debug("Orbnaments loading...");

		await this.loadSettings();

		this.addSettingTab(new OrbnamentsSettingTab(this.app, this));

		this.addCommand({
			id: "download-videogame-covers",
			name: "Download missing videogame covers",
			callback: async () => {
				await downloadVideogameCovers(this, this.app);
			},
		});

		this.addCommand({
			id: "create-new-quote-note",
			name: "Create new quote note",
			callback: async () => {
				await createQuoteNote(this.app);
			},
		});

		this.addCommand({
			id: "open-random-quote",
			name: "Random quote",
			callback: async () => {
				await openRandomQuote(this.app);
			},
		});

		this.addCommand({
			id: "create-thoughts-note",
			name: "Thoughts on this note",
			callback: async () => {
				await createThoughtsNote(this.app);
			},
		});

		this.addCommand({
			id: "create-new-expense",
			name: "New expense",
			callback: async () => {
				await createExpenseNote(this.app);
			},
		});

		this.addCommand({
			id: "move-selection-to-footnote",
			name: "Move selection to a new footnote",
			editorCallback: (editor: Editor) => {
				moveSelectionToFootnote(this.app, editor);
			},
		});

		this.addCommand({
			id: "remove-syncthing-conflict",
			// Syncthing is a proper name.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			name: "Clear Syncthing's conflicts",
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

		this.addCommand({
			id: "move-expenses-files",
			name: "Tidy up expenses from the vault root",
			callback: async () => {
				const result = await this.moveExpensesFiles();

				const [count, error] = result.toTuple();

				if (error) {
					new Notice(`Error moving files: ${error.message}`);
					console.error(error);
					return;
				}

				if (count === 0) {
					new Notice(
						"No files found linking to [[expenses]] in root",
					);
				} else {
					new Notice(`Moved ${count} file(s) to Finanzas folder`);
				}
			},
		});

		this.addCommand({
			id: "move-orphaned-attachments",
			name: "Move orphaned attachments closer to their files",
			callback: async () => {
				const result = await this.moveOrphanedAttachments();

				const [count, error] = result.toTuple();

				if (error) {
					new Notice(`Error moving attachments: ${error.message}`);
					console.error(error);
					return;
				}

				if (count === 0) {
					new Notice("No orphaned attachments found");
				} else {
					new Notice(`Moved ${count} attachment(s)`);
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
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

	/**
	 * Move files that link to [[expenses]] from the root of the vault to the "Finanzas" folder
	 * @returns a Result containing the number of files moved or an error
	 */
	async moveExpensesFiles(): Promise<Result<number, MoveFilesError>> {
		return Result.try(async () => {
			const vault = this.app.vault;
			const metadataCache = this.app.metadataCache;
			const fileManager = this.app.fileManager;

			// Find the expenses file
			const expensesFile = metadataCache.getFirstLinkpathDest(
				"expenses",
				"",
			);

			if (!expensesFile) {
				return 0;
			}

			// Get all files that link to expenses using resolvedLinks
			const resolvedLinks = metadataCache.resolvedLinks;
			const filesToMove = [];

			for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
				// Check if this file links to expenses
				if (links[expensesFile.path]) {
					const file = vault.getFileByPath(sourcePath);

					// Only move files in the vault root
					if (
						file &&
						(file.parent?.path === "" || file.parent?.path === "/")
					) {
						filesToMove.push(file);
					}
				}
			}

			if (filesToMove.length === 0) {
				return 0;
			}

			// Ensure the Finanzas folder exists
			const finanzasPath = "Finanzas";
			let finanzasFolder = vault.getFolderByPath(finanzasPath);

			if (!finanzasFolder) {
				await vault.createFolder(finanzasPath);
				finanzasFolder = vault.getFolderByPath(finanzasPath);
			}

			if (!finanzasFolder) {
				throw new MoveFilesError(
					"Failed to create or access Finanzas folder",
				);
			}

			// Move each file
			const movePromises = filesToMove.map((file) => {
				const newPath = `${finanzasPath}/${file.name}`;
				return fileManager.renameFile(file, newPath);
			});

			await Promise.all(movePromises);
			return filesToMove.length;
		}).mapError((error) => {
			return new MoveFilesError(
				`Failed to move files: ${error.message}`,
				error,
			);
		});
	}

	/**
	 * Move attachments from the root attachments folder to be closer to their associated files.
	 * Only moves attachments that are linked from a single file.
	 * @param attachmentsFolder - The root folder containing attachments (default: "img")
	 * @returns a Result containing the number of attachments moved or an error
	 */
	async moveOrphanedAttachments(
		attachmentsFolder: string = "img",
	): Promise<Result<number, MoveAttachmentsError>> {
		return Result.try(async () => {
			const vault = this.app.vault;
			const metadataCache = this.app.metadataCache;
			const fileManager = this.app.fileManager;

			// Get the attachments folder
			const rootFolder = vault.getFolderByPath(attachmentsFolder);
			if (!rootFolder) {
				return 0;
			}

			// Get only files in the specified attachments folder
			const attachmentsInRoot = rootFolder.children.filter(
				(child): child is TFile => child instanceof TFile,
			);

			if (attachmentsInRoot.length === 0) {
				return 0;
			}

			// Move attachments that are only linked from one file
			let movedCount = 0;

			for (const attachment of attachmentsInRoot) {
				// Find all files that link to this attachment by checking backlinks
				const linkers: string[] = [];
				const resolvedLinks = metadataCache.resolvedLinks;

				for (const [sourcePath, links] of Object.entries(
					resolvedLinks,
				)) {
					if (links[attachment.path]) {
						linkers.push(sourcePath);
					}
				}

				// Only move if linked from exactly one file
				if (linkers.length !== 1) {
					continue;
				}

				const linkerPath = linkers[0];
				if (!linkerPath) {
					continue;
				}

				const linkerFile = vault.getFileByPath(linkerPath);
				if (!linkerFile) {
					continue;
				}

				// Determine the target folder (same folder as the linking file + /attachmentsFolder)
				const linkerParentPath = linkerFile.parent?.path ?? "";
				const targetFolderPath: string =
					linkerParentPath === "" || linkerParentPath === "/"
						? attachmentsFolder
						: `${linkerParentPath}/${attachmentsFolder}`;

				// Skip if the attachment is already in the right place
				const targetPath = `${targetFolderPath}/${attachment.name}`;
				if (attachment.path === targetPath) {
					continue;
				}

				// Create the target folder if it doesn't exist
				const folderExists =
					await vault.adapter.exists(targetFolderPath);
				if (!folderExists) {
					await vault.createFolder(targetFolderPath);
				}

				// Move the attachment
				await fileManager.renameFile(attachment, targetPath);
				movedCount++;
			}

			return movedCount;
		}).mapError((error) => {
			return new MoveAttachmentsError(
				`Failed to move attachments: ${error.message}`,
				error,
			);
		});
	}
}

// Error class for file moving operations
class MoveFilesError extends Error {
	readonly type = "move-files-error";
	cause?: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "MoveFilesError";
		this.cause = cause;
	}
}
