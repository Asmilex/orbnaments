import { App, TFile, moment } from "obsidian";
import type { PdfDocumentOptions } from "./types";
import { asStrings, stripWikilink } from "../../utils/obsidian-markdown";

function firstOf(
	frontmatter: Record<string, unknown>,
	...keys: string[]
): string | undefined {
	for (const key of keys) {
		const values = asStrings(frontmatter[key]);

		if (values[0]) {
			return values[0];
		}
	}

	return undefined;
}

/** Pulls a `YYYY-MM-DD` out of whatever the frontmatter happens to hold. */
function normalizeDate(raw: string | undefined): string {
	if (!raw) {
		return "";
	}

	const parsed = moment(raw.trim(), ["YYYY-MM-DD", moment.ISO_8601], false);

	return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

/**
 * Seed the export options from the note itself. Unlike the shell script this
 * reads Obsidian's parsed frontmatter, so any YAML the app understands works here.
 */
export function documentOptionsFromNote(
	app: App,
	file: TFile,
	fallbackLanguage: string,
): PdfDocumentOptions {
	const frontmatter =
		(app.metadataCache.getFileCache(file)?.frontmatter as
			| Record<string, unknown>
			| undefined) ?? {};

	const authors = [
		...asStrings(frontmatter["authors"]),
		...asStrings(frontmatter["author"]),
	]
		.map(stripWikilink)
		.filter((author) => author.length > 0);

	const date =
		normalizeDate(firstOf(frontmatter, "date", "created", "published")) ||
		moment().format("YYYY-MM-DD");

	return {
		title: firstOf(frontmatter, "title") ?? file.basename,
		authors: [...new Set(authors)],
		abstract: firstOf(frontmatter, "description", "abstract", "summary") ?? "",
		date,
		language: firstOf(frontmatter, "lang", "language") ?? fallbackLanguage,
		sourceLink: firstOf(frontmatter, "link", "source", "url") ?? "",
	};
}
