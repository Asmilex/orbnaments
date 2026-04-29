import { App, Notice, normalizePath } from "obsidian";

const QUOTES_FOLDER_PATH = "Citas";

function getUniqueQuotePath(app: App, baseName: string): string {
	let index = 0;

	while (true) {
		const candidateName = index === 0 ? baseName : `${baseName} ${index}`;
		const candidatePath = normalizePath(
			`${QUOTES_FOLDER_PATH}/${candidateName}.md`,
		);

		if (!app.vault.getAbstractFileByPath(candidatePath)) {
			return candidatePath;
		}

		index++;
	}
}

export async function createQuoteNote(app: App): Promise<void> {
	const activeEditor = app.workspace.activeEditor;
	const editor = activeEditor?.editor;
	const sourceFile = activeEditor?.file;

	if (!editor || !sourceFile) {
		new Notice("Open a note in editor mode first");
		return;
	}

	const from = editor.somethingSelected()
		? editor.getCursor("from")
		: { line: editor.getCursor().line, ch: 0 };
	const to = editor.somethingSelected()
		? editor.getCursor("to")
		: {
				line: editor.getCursor().line,
				ch: editor.getLine(editor.getCursor().line).length,
			};

	const quoteText = editor.getRange(from, to);

	if (!quoteText.trim()) {
		new Notice("Select text or place the cursor on a non-empty line");
		return;
	}

	try {
		if (!app.vault.getFolderByPath(QUOTES_FOLDER_PATH)) {
			await app.vault.createFolder(QUOTES_FOLDER_PATH);
		}

		const sourceName = sourceFile.basename
			.replace(/[\\/:*?"<>|]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		const quoteBaseName = `Quoting ${sourceName || "Untitled"}`;
		const quotePath = getUniqueQuotePath(app, quoteBaseName);

		const sourceLinkText = app.metadataCache.fileToLinktext(
			sourceFile,
			quotePath,
			true,
		);
		const sourceLink = `[[${sourceLinkText}]]`;

		const quoteContent = `---\ncategories:\n  - "[[citas]]"\nsource: "${sourceLink}"\n---\n${quoteText}\n`;

		const quoteFile = await app.vault.create(quotePath, quoteContent);

		const quoteLinkText = app.metadataCache.fileToLinktext(
			quoteFile,
			sourceFile.path,
			true,
		);
		editor.replaceRange(`![[${quoteLinkText}]]`, from, to);

		await app.workspace.getLeaf(true).openFile(quoteFile);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not create quote note: ${message}`);
		console.error(error);
	}
}
