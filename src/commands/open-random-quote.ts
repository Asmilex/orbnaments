import { App, Notice, TFile } from "obsidian";

const QUOTES_INDEX_NOTE = "citas";

export async function openRandomQuote(app: App): Promise<void> {
	const metadataCache = app.metadataCache;
	const vault = app.vault;

	const quotesIndexFile = metadataCache.getFirstLinkpathDest(
		QUOTES_INDEX_NOTE,
		"",
	);

	if (!quotesIndexFile) {
		new Notice(`No [[${QUOTES_INDEX_NOTE}]] note found in the vault`);
		return;
	}

	const quotes: TFile[] = [];

	for (const [sourcePath, links] of Object.entries(
		metadataCache.resolvedLinks,
	)) {
		if (
			sourcePath === quotesIndexFile.path ||
			!links[quotesIndexFile.path]
		) {
			continue;
		}

		const file = vault.getFileByPath(sourcePath);

		if (file) {
			quotes.push(file);
		}
	}

	if (quotes.length === 0) {
		new Notice(`No notes linking to [[${QUOTES_INDEX_NOTE}]] found`);
		return;
	}

	const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

	if (!randomQuote) {
		new Notice("Could not pick a random quote");
		return;
	}

	try {
		await app.workspace.getLeaf(true).openFile(randomQuote);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not open the random quote: ${message}`);
		console.error(error);
	}
}
