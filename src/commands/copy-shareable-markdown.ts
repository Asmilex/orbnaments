import { App, Notice, TFile } from "obsidian";
import {
	asStrings,
	demoteHeadings,
	extractSection,
	headingLevelBefore,
	maskCode,
	replaceAsync,
	splitTarget,
	stripWikilink,
} from "../utils/obsidian-markdown";

/** Nesting limit for `![[note]]` transclusion, so a cycle can't run away. */
const MAX_EMBED_DEPTH = 4;

const MASK_OPEN = "\u{F0000}";
const MASK_CLOSE = "\u{F0001}";

/** `- `, `1. ` and `> ` prefixes that a transcluded block has to inherit. */
const LINE_CONTAINER = /^((?:[ \t]*>[ \t]?)*)([ \t]*(?:[-*+]|\d+[.)])[ \t]+)?/;

/**
 * Rewrites a note into markdown that reads well outside the vault:
 * `[[wikilinks]]` point at the target's `link` property, crediting its
 * `authors`, and `![[note]]` embeds are inlined. Attachments are left as-is.
 */
class ShareableMarkdown {
	constructor(private readonly app: App) {}

	async transform(
		markdown: string,
		sourcePath: string,
		stack: string[],
	): Promise<string> {
		const masked: string[] = [];
		const mask = (literal: string) => {
			masked.push(literal);
			return `${MASK_OPEN}${masked.length - 1}${MASK_CLOSE}`;
		};

		let text = maskCode(markdown, mask);
		text = text.replace(/%%[\s\S]*?%%/g, "");
		text = text.replace(/[ \t]+\^[A-Za-z0-9-]+$/gm, "");
		text = text.replace(/(?<!!)\[\[([^\]\n]+)\]\]/g, (whole, inner: string) =>
			this.link(inner, sourcePath),
		);
		// Last, so the inlined notes (already rewritten) aren't processed twice.
		text = await replaceAsync(
			text,
			/!\[\[([^\]\n]+)\]\]/g,
			async (match) => await this.embed(text, match, sourcePath, stack),
		);

		return text.replace(
			new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, "g"),
			(whole, index: string) => masked[Number(index)] ?? whole,
		);
	}

	/** `[[Note|Alias]]` -> `[Alias (Author)](link)`, or plain text without a link. */
	private link(inner: string, sourcePath: string): string {
		const { linkpath, display } = splitTarget(inner);
		const file = this.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			sourcePath,
		);
		const label =
			display || file?.basename || linkpath.split("/").pop() || linkpath;

		if (!file || file.extension !== "md") {
			return label;
		}

		const frontmatter = this.app.metadataCache.getFileCache(file)
			?.frontmatter as Record<string, unknown> | undefined;
		const url = asStrings(frontmatter?.["link"])
			.map((value) => value.trim())
			.find((value) => /^https?:\/\//.test(value));

		const authors = asStrings(frontmatter?.["authors"])
			.map(stripWikilink)
			.filter((author) => author.length > 0 && !label.includes(author));
		const credited =
			authors.length > 0 ? `${label} (${authors.join(", ")})` : label;

		if (!url) {
			return credited;
		}

		const text = credited.replace(/[[\]]/g, "\\$&");
		const href = url.replace(/[\s()<>]/g, encodeURIComponent);

		return `[${text}](${href})`;
	}

	private async embed(
		text: string,
		match: RegExpExecArray,
		sourcePath: string,
		stack: string[],
	): Promise<string> {
		const whole = match[0];
		const { linkpath, subpath } = splitTarget(match[1] ?? "");
		const file = this.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			sourcePath,
		);

		if (!file || file.extension !== "md") {
			return whole;
		}

		if (stack.length > MAX_EMBED_DEPTH || stack.includes(file.path)) {
			return this.link(match[1] ?? "", sourcePath);
		}

		const raw = await this.app.vault.cachedRead(file);
		const section = extractSection(this.app, file, raw, subpath);

		if (section === null) {
			return this.link(match[1] ?? "", sourcePath);
		}

		const expanded = demoteHeadings(
			(await this.transform(section, file.path, [...stack, file.path])).trim(),
			headingLevelBefore(text, match.index) + 1,
		);

		return this.placeBlock(text, match.index, whole.length, expanded);
	}

	/**
	 * Embeds are blocks, but they often sit mid-line (`- tips: ![[note]]`). Push
	 * them onto their own paragraph, indented to stay inside the list item or
	 * blockquote that holds them.
	 */
	private placeBlock(
		text: string,
		index: number,
		length: number,
		block: string,
	): string {
		const lineStart = text.lastIndexOf("\n", index - 1) + 1;
		const lineEnd = text.indexOf("\n", index + length);
		const before = text.slice(lineStart, index);
		const after = text.slice(
			index + length,
			lineEnd === -1 ? text.length : lineEnd,
		);

		const container = LINE_CONTAINER.exec(before);
		const quotes = container?.[1] ?? "";
		const prefix = quotes + " ".repeat(container?.[2]?.length ?? 0);
		const gap = `\n${quotes.trimEnd()}\n`;
		const [first = "", ...rest] = block
			.split("\n")
			.map((line) => (line.length > 0 ? prefix + line : quotes.trimEnd()));

		// Alone on its line, the line's own `- ` or `> ` already opens the block.
		const inline =
			before.slice(container?.[0].length ?? 0).trim().length > 0;
		const head = inline ? `${gap}${first}` : first.slice(prefix.length);
		const tail = after.trim().length > 0 ? `${gap}${prefix}` : "";

		return [head, ...rest].join("\n") + tail;
	}
}

/** The note's body, minus frontmatter, ready to paste outside Obsidian. */
export async function shareableMarkdown(app: App, file: TFile): Promise<string> {
	const raw = await app.vault.cachedRead(file);
	const body = extractSection(app, file, raw, "") ?? raw;
	const markdown = await new ShareableMarkdown(app).transform(
		body,
		file.path,
		[file.path],
	);

	return markdown.trim() + "\n";
}

/** Entry point for the "Copy as shareable markdown" command. */
export async function copyAsShareableMarkdown(app: App): Promise<void> {
	const file = app.workspace.getActiveFile();

	if (!(file instanceof TFile) || file.extension !== "md") {
		new Notice("Open a markdown note first");
		return;
	}

	try {
		await navigator.clipboard.writeText(await shareableMarkdown(app, file));
		new Notice(`Copied ${file.basename} as shareable markdown`);
	} catch (error) {
		console.error("Orbnaments: could not copy shareable markdown", error);
		new Notice(
			error instanceof Error
				? `Could not copy the note: ${error.message}`
				: "Could not copy the note.",
		);
	}
}
