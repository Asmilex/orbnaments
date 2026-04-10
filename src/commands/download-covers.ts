import { App, Notice, TFile } from "obsidian";
import SGDB from "steamgriddb";
import type OrbnamentsPlugin from "../main";

export function videogameEntries(app: App): TFile[] {
	const metadataCache = app.metadataCache;

	// Find the videogame-entry file
	const videogameEntryFile = metadataCache.getFirstLinkpathDest("videogame-entry", "");
	if (!videogameEntryFile) {
		return [];
	}

	// Get all files that link to videogame-entry (backlinks)
	const resolvedLinks = metadataCache.resolvedLinks;
	const videogameFiles: TFile[] = [];

	for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
		if (links[videogameEntryFile.path]) {
			const file = app.vault.getFileByPath(sourcePath);
			if (file instanceof TFile) {
				videogameFiles.push(file);
			}
		}
	}

	return videogameFiles;
}

export function videogameEntriesMissingCover(app: App, entries: TFile[]): TFile[] {
	return entries.filter((file) => {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) return false;
		
		const cover = frontmatter.cover;
		return !cover || cover.startsWith("http");
	});
}

export async function pullCoverFromSteamGridDB(
	app: App,
	client: SGDB,
	gameName: string,
	destPath: string = "Videojuegos/img"
): Promise<string | null> {
	const games = await client.searchGame(gameName);
	if (!games || games.length === 0 || !games[0]) return null;

	const gameId = games[0].id;
	const grids = await client.getGrids({ type: "game", id: gameId });

	if (!grids || grids.length === 0 || !grids[0]) return null;

	const coverUrl = grids[0].url;
	const coverExt = coverUrl.toString().split(".").pop() || "png";
	const targetExt = coverExt === "webp" ? "webp" : coverExt;
	const coverFilename = `${gameName} — cover.${targetExt}`;

	// Ensure the destination path exists
	const folderExists = await app.vault.adapter.exists(destPath);
	if (!folderExists) {
		await app.vault.createFolder(destPath);
	}

	const coverPath = `${destPath}/${coverFilename}`;
	const existingFile = app.vault.getAbstractFileByPath(coverPath);

	if (!existingFile) {
		const response = await fetch(coverUrl);
		const arrayBuffer = await response.arrayBuffer();
		await app.vault.createBinary(coverPath, arrayBuffer);
	}

	return coverFilename;
}

export async function setCover(app: App, file: TFile, coverFilename: string) {
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm.cover = `[[${coverFilename}]]`;
	});
}

export async function downloadVideogameCovers(plugin: OrbnamentsPlugin, app: App) {
	const secretName = plugin.settings.steamGridDbSecretName;
	
	let apiKey = secretName;
	
	// if secret storage exists use it
	if (secretName && (app as any).secretStorage) {
		apiKey = await (app as any).secretStorage.getSecret(secretName) || secretName;
	}

	if (!apiKey) {
		new Notice("SteamGridDB API Key is not configured in settings.");
		return;
	}

	const client = new SGDB(apiKey);
	const allEntries = videogameEntries(app);
	
	if (allEntries.length === 0) {
		new Notice("No videogame entries found.");
		return;
	}
	
	const missingCoverEntries = videogameEntriesMissingCover(app, allEntries);

	let successCount = 0;
	let failCount = 0;
	const skipCount = allEntries.length - missingCoverEntries.length;

	for (const file of missingCoverEntries) {
		const gameName = file.basename.replace(/\s*\+.*$/, "").trim(); // Basic clean up
		new Notice(`Searching cover for ${gameName}...`);

		try {
			const coverFilename = await pullCoverFromSteamGridDB(app, client, gameName);
			
			if (coverFilename) {
				await setCover(app, file, coverFilename);
				successCount++;
				new Notice(`Successfully added cover for ${gameName}`);
			} else {
				failCount++;
				new Notice(`No covers found for ${gameName}`);
			}
		} catch (error) {
			console.error(`Error processing ${gameName}:`, error);
			failCount++;
			new Notice(`Error downloading cover for ${gameName}`);
		}
	}

	new Notice(
		`Cover download complete: ${successCount} added, ${skipCount} skipped, ${failCount} failed.`
	);
}