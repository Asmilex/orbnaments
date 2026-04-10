import { App, Notice, requestUrl } from "obsidian";
import type OrbnamentsPlugin from "../main";

interface SteamGridDBGame {
	id: number;
	name: string;
}

interface SteamGridDBGrid {
	id: number;
	url: string;
}

async function searchGame(
	apiKey: string,
	gameName: string,
): Promise<SteamGridDBGame[]> {
	try {
		const response = await requestUrl({
			url: `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(gameName)}`,
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		const data = JSON.parse(response.text);
		return data.data || [];
	} catch (error) {
		console.error(`Error searching for game: ${gameName}`, error);
		return [];
	}
}

async function getGrids(
	apiKey: string,
	gameId: number,
): Promise<SteamGridDBGrid[]> {
	try {
		const response = await requestUrl({
			url: `https://www.steamgriddb.com/api/v2/grids/game/${gameId}`,
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		const data = JSON.parse(response.text);
		return data.data || [];
	} catch (error) {
		console.error(`Error getting grids for game ${gameId}:`, error);
		return [];
	}
}

async function downloadImage(url: string): Promise<ArrayBuffer> {
	const response = await requestUrl({
		url: url,
	});
	return response.arrayBuffer;
}

export async function downloadVideogameCovers(
	plugin: OrbnamentsPlugin,
	app: App,
) {
	const apiKey = plugin.settings.steamGridDbApiKey;
	if (!apiKey) {
		new Notice("SteamGridDB API Key is not set in settings.");
		return;
	}

	const files = app.vault.getMarkdownFiles();
	let successCount = 0;
	let failCount = 0;
	let skipCount = 0;

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter) continue;

		// Check if it's a videogame entry
		const isVideogame =
			frontmatter.categories?.includes("[[videogame-entry]]") ||
			frontmatter.categories?.includes("videogame-entry");
		if (!isVideogame) continue;

		// Check if it already has a local cover
		const cover = frontmatter.cover;
		if (cover && !cover.startsWith("http")) {
			skipCount++;
			continue; // Skip if it already has a local cover
		}

		// Process this file
		const gameName = file.basename.replace(/\s*\+.*$/, "").trim(); // Basic clean up
		new Notice(`Searching cover for ${gameName}...`);

		try {
			const games = await searchGame(apiKey, gameName);
			if (games && games.length > 0 && games[0]) {
				const gameId = games[0].id;
				const grids = await getGrids(apiKey, gameId);

				if (grids && grids.length > 0 && grids[0]) {
					const coverUrl = grids[0].url;
					const coverExt =
						coverUrl.toString().split(".").pop() || "png";
					const targetExt =
						coverExt === "webp" ? "webp" : coverExt;
					const coverFilename = `${gameName} — cover.${targetExt}`;

					// Fetch the image
					const arrayBuffer = await downloadImage(coverUrl);

					// Save the image to Videojuegos/img/
					const imgFolderPath = "Videojuegos/img";
					const coverPath = `${imgFolderPath}/${coverFilename}`;

					// Ensure the img folder exists
					const imgFolder =
						app.vault.getFolderByPath(imgFolderPath);
					if (!imgFolder) {
						await app.vault.createFolder(imgFolderPath);
					}

					const existingFile =
						app.vault.getAbstractFileByPath(coverPath);
					if (!existingFile) {
						await app.vault.createBinary(coverPath, arrayBuffer);
					}

					// Update frontmatter
					await app.fileManager.processFrontMatter(file, (fm) => {
						fm.cover = `[[${coverFilename}]]`;
					});

					successCount++;
					new Notice(`Successfully added cover for ${gameName}`);
				} else {
					failCount++;
					new Notice(`No covers found for ${gameName}`);
				}
			} else {
				failCount++;
				new Notice(`Game not found on SteamGridDB: ${gameName}`);
			}
		} catch (error) {
			console.error(`Error processing ${gameName}:`, error);
			failCount++;
			new Notice(`Error downloading cover for ${gameName}`);
		}
	}

	new Notice(
		`Cover download complete: ${successCount} added, ${skipCount} skipped, ${failCount} failed.`,
	);
}
