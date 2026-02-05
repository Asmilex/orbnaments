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
      name: "Clear Syncthing's conflicts",
      callback: async () => {
        const result = await this.removeSyncConflicts();

        const [count, error] = result.toTuple();

        if (error) {
          new Notice(`Error removing sync conflict files: ${error.message}`);
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
      name: "Tidy up expenses from the vault root.",
      callback: async () => {
        const result = await this.moveExpensesFiles();

        const [count, error] = result.toTuple();

        if (error) {
          new Notice(`Error moving files: ${error.message}`);
          console.error(error);
          return;
        }

        if (count === 0) {
          new Notice("No files found linking to [[expenses]] in root");
        } else {
          new Notice(`Moved ${count} file(s) to Finanzas folder`);
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
      const expensesFile = metadataCache.getFirstLinkpathDest("expenses", "");

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
          if (file && (file.parent?.path === "" || file.parent?.path === "/")) {
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
        throw new MoveFilesError("Failed to create or access Finanzas folder");
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
