import { Notice, TFile, moment, normalizePath } from "obsidian";
import Defuddle from "defuddle/full";
import type OrbnamentsPlugin from "../../main";
import { asStrings } from "../../utils/obsidian-markdown";
import { pickArticle } from "../../ui/wikipedia-search-modal";
import { WikiPage, fetchArticleHtml, lookupPage } from "./api";
import { RewriteStats, normalizeTitle, parseWikiUrl, rewriteWikipediaLinks } from "./links";
import { NoteIndex } from "./note-index";
import { detectCategories } from "./categories";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function splitFrontmatter(raw: string): { head: string; body: string } {
	const head = FRONTMATTER.exec(raw)?.[0] ?? "";

	return { head, body: raw.slice(head.length) };
}

/**
 * The article a note's title stands for. Tries the main wiki, then the second
 * one (for titles written in Spanish) following its translation, then asks.
 */
async function resolveArticle(
	plugin: OrbnamentsPlugin,
	title: string,
): Promise<WikiPage | "cancelled" | null> {
	const main = plugin.settings.wikipediaLanguage;
	const second = plugin.settings.wikipediaAliasLanguage;

	const direct = await lookupPage(main, title, second);

	if (direct && !direct.disambiguation) {
		return direct;
	}

	if (second) {
		const local = await lookupPage(second, title, main);

		if (local && !local.disambiguation && local.translation) {
			const translated = await lookupPage(main, local.translation, second);

			if (translated && !translated.disambiguation) {
				return translated;
			}
		}
	}

	const picked = await pickArticle(plugin.app, main, title);

	if (picked === null) {
		return "cancelled";
	}

	return await lookupPage(main, picked, second);
}

/** Defuddle's markdown, minus what it leaves behind on Wikipedia. */
function articleMarkdown(html: string, url: string): string {
	const document = new DOMParser().parseFromString(html, "text/html");
	const markdown = new Defuddle(document, { url, markdown: true }).parse().content;

	return (
		markdown
			// Page numbers next to a citation, `[^12]<sup>: 166</sup>`.
			.replace(/<sup>\s*<span title="[^"]*">\s*:[^<]*<\/span>\s*<\/sup>/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim() + "\n"
	);
}

function describe(stats: RewriteStats): string {
	return stats.linked === 1 ? "1 link to your notes" : `${stats.linked} links to your notes`;
}

/**
 * Fills the active note, which has to be empty, with the Wikipedia article its
 * title names, in the shape the Web Clipper template uses. Links to articles
 * that have a note become wikilinks.
 */
export async function fillFromWikipedia(plugin: OrbnamentsPlugin): Promise<void> {
	const { app, settings } = plugin;
	const file = app.workspace.getActiveFile();

	if (!(file instanceof TFile) || file.extension !== "md") {
		new Notice("Open the note to fill first");
		return;
	}

	if (splitFrontmatter(await app.vault.read(file)).body.trim().length > 0) {
		new Notice("This note already has content");
		return;
	}

	const progress = new Notice(`Looking up "${file.basename}" on Wikipedia…`, 0);

	try {
		const page = await resolveArticle(plugin, file.basename);

		if (page === "cancelled") {
			return;
		}

		if (page === null) {
			new Notice(`No Wikipedia article for "${file.basename}"`);
			return;
		}

		progress.setMessage(`Fetching "${page.title}"…`);

		const markdown = articleMarkdown(await fetchArticleHtml(page.url), page.url);
		const categories = await detectCategories(app, markdown, {
			lang: page.lang,
			otherLang: settings.wikipediaAliasLanguage,
			folder: settings.wikipediaCategoryFolder,
			self: file,
			title: page.title,
		}).catch((error) => {
			console.warn("Couldn't detect categories", error);
			return [] as string[];
		});
		const categoryLinks = categories.map((category) => `[[${category}]]`);
		const index = new NoteIndex(app);
		const { text, stats } = rewriteWikipediaLinks(markdown, {
			lang: page.lang,
			resolve: index.resolver(file.path),
		});

		let written = false;

		await app.vault.process(file, (raw) => {
			const { head, body } = splitFrontmatter(raw);

			// Typed into while the article was on its way.
			if (body.trim().length > 0) {
				return raw;
			}

			written = true;
			return head + text;
		});

		if (!written) {
			new Notice("The note changed while fetching; left it alone");
			return;
		}

		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			const merge = (key: string, values: string[]) => {
				const current = asStrings(frontmatter[key]);
				const missing = values.filter(
					(value) => !current.some((existing) => normalizeTitle(existing) === normalizeTitle(value)),
				);

				frontmatter[key] = [...current, ...missing];
			};

			merge("categories", ["[[clippings]]", ...categoryLinks]);
			if (!frontmatter.headline) frontmatter.headline = page.description;
			frontmatter.description ??= "";
			merge("source", ["[[Wikipedia]]"]);
			frontmatter.created ??= moment().format("YYYY-MM-DD");
			frontmatter.link = page.url;
			merge(
				"aliases",
				[page.title, page.translation ?? ""].filter(
					(alias) => alias && normalizeTitle(alias) !== normalizeTitle(file.basename),
				),
			);

			if (asStrings(frontmatter.aliases).length === 0) {
				delete frontmatter.aliases;
			}
		});

		// Renaming may stop to ask about updating links.
		progress.hide();
		await moveToFolder(plugin, file).catch((error) => {
			console.error("Moving the filled note failed", error);
			new Notice(`Filled, but couldn't move it to ${settings.wikipediaFolder}`);
		});

		new Notice(
			`Filled from "${page.title}", ${describe(stats)}` +
				(categoryLinks.length > 0 ? `, filed under ${categoryLinks.join(", ")}` : ""),
		);
	} catch (error) {
		console.error("Filling from Wikipedia failed", error);
		new Notice(`Couldn't fill from Wikipedia: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		progress.hide();
	}
}

async function moveToFolder(plugin: OrbnamentsPlugin, file: TFile): Promise<void> {
	const folder = normalizePath(plugin.settings.wikipediaFolder.trim());
	const { vault, fileManager } = plugin.app;

	if (!plugin.settings.wikipediaFolder.trim() || file.parent?.path === folder) {
		return;
	}

	const destination = normalizePath(`${folder}/${file.name}`);

	if (vault.getAbstractFileByPath(destination)) {
		new Notice(`${destination} already exists; left the note where it was`);
		return;
	}

	if (!vault.getFolderByPath(folder)) {
		await vault.createFolder(folder);
	}

	await fileManager.renameFile(file, destination);
}

/**
 * Re-points the links of every Wikipedia clipping (a note whose `link` is a
 * Wikipedia article) at the notes that exist now. Safe to run again: links to
 * articles without a note stay as absolute Wikipedia links until one appears.
 */
export async function relinkWikipediaClippings(plugin: OrbnamentsPlugin): Promise<void> {
	const { app } = plugin;
	const index = new NoteIndex(app);
	const total: RewriteStats = { linked: 0, absolutized: 0, unlinked: 0 };
	let changed = 0;

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const article = asStrings(frontmatter?.link)
			.map((link) => parseWikiUrl(link, "en"))
			.find((target) => target !== null);

		if (!article) {
			continue;
		}

		await app.vault.process(file, (raw) => {
			const { head, body } = splitFrontmatter(raw);
			const { text, stats } = rewriteWikipediaLinks(body, {
				lang: article.lang,
				resolve: index.resolver(file.path),
			});

			if (text === body) {
				return raw;
			}

			changed++;
			total.linked += stats.linked;
			total.absolutized += stats.absolutized;
			total.unlinked += stats.unlinked;

			return head + text;
		});
	}

	new Notice(
		changed === 0
			? "Wikipedia clippings already up to date"
			: `Updated ${changed} clipping(s): ${describe(total)}, ${total.absolutized} fixed Wikipedia link(s), ${total.unlinked} dead link(s) unlinked`,
	);
}
