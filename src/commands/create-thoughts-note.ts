import { App, Notice, normalizePath } from "obsidian";

const THOUGHTS_FOLDER_PATH = "Thoughts";

function getUniqueThoughtsPath(app: App, baseName: string): string {
	let index = 0;

	while (true) {
		const candidateName = index === 0 ? baseName : `${baseName} ${index}`;
		const candidatePath = normalizePath(
			`${THOUGHTS_FOLDER_PATH}/${candidateName}.md`,
		);

		if (!app.vault.getAbstractFileByPath(candidatePath)) {
			return candidatePath;
		}

		index++;
	}
}

export async function createThoughtsNote(app: App): Promise<void> {
	const activeEditor = app.workspace.activeEditor;
	const sourceFile = activeEditor?.file;

	if (!sourceFile) {
		new Notice("Open a note first");
		return;
	}

	try {
		if (!app.vault.getFolderByPath(THOUGHTS_FOLDER_PATH)) {
			await app.vault.createFolder(THOUGHTS_FOLDER_PATH);
		}

		const sourceName = sourceFile.basename
			.replace(/[\\/:*?"<>|]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		const thoughtsBaseName = `Thoughts on ${sourceName || "Untitled"}`;
		const thoughtsPath = getUniqueThoughtsPath(app, thoughtsBaseName);

		const sourceLinkText = app.metadataCache.fileToLinktext(
			sourceFile,
			thoughtsPath,
			true,
		);
		const sourceLink = `[[${sourceLinkText}]]`;

		const thoughtsContent = `---\ncategories:\n  - "[[thoughts]]"\nsource: "${sourceLink}"\n---\n`;

		const thoughtsFile = await app.vault.create(
			thoughtsPath,
			thoughtsContent,
		);

		await app.workspace.getLeaf(true).openFile(thoughtsFile);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not create thoughts note: ${message}`);
		console.error(error);
	}
}
