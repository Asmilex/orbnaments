import { App, TFile } from "obsidian";

/** Helpers for reading Obsidian-flavoured markdown, shared by the exporters. */

export const FENCE = /^\s{0,3}(```|~~~)/;

export async function replaceAsync(
	text: string,
	pattern: RegExp,
	replacer: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
	const matches: RegExpExecArray[] = [];
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text)) !== null) {
		matches.push(match);

		if (match[0].length === 0) {
			pattern.lastIndex++;
		}
	}

	if (matches.length === 0) {
		return text;
	}

	const pieces: string[] = [];
	let cursor = 0;

	for (const found of matches) {
		pieces.push(text.slice(cursor, found.index));
		pieces.push(await replacer(found));
		cursor = found.index + found[0].length;
	}

	pieces.push(text.slice(cursor));

	return pieces.join("");
}

/**
 * Hands every fenced block and code span to `mask`, which returns the
 * placeholder that takes its place, so later rewrites leave code alone.
 */
export function maskCode(text: string, mask: (literal: string) => string): string {
	const lines = text.split("\n");
	const out: string[] = [];
	let block: string[] | null = null;
	let fence = "";

	for (const line of lines) {
		const opener = FENCE.exec(line);

		if (block === null) {
			if (opener?.[1]) {
				block = [line];
				fence = opener[1];
			} else {
				out.push(line);
			}
			continue;
		}

		block.push(line);

		if (opener?.[1] === fence) {
			out.push(mask(block.join("\n")));
			block = null;
		}
	}

	if (block !== null) {
		out.push(mask(block.join("\n")));
	}

	return out.join("\n").replace(/(`+)([^`]+)\1/g, (whole) => mask(whole));
}

/** Splits `path#subpath|display` into its three parts. */
export function splitTarget(target: string): {
	linkpath: string;
	subpath: string;
	display: string;
} {
	const pipe = target.indexOf("|");
	const display = pipe === -1 ? "" : target.slice(pipe + 1).trim();
	const head = (pipe === -1 ? target : target.slice(0, pipe)).trim();
	const hash = head.indexOf("#");

	return {
		linkpath: (hash === -1 ? head : head.slice(0, hash)).trim(),
		subpath: hash === -1 ? "" : head.slice(hash + 1).trim(),
		display,
	};
}

/** `"[[Someone|Alias]]"` -> `"Alias"`, plain strings pass through untouched. */
export function stripWikilink(value: string): string {
	const match = /^\s*\[\[(.+?)\]\]\s*$/.exec(value);

	if (!match?.[1]) {
		return value.trim();
	}

	const inner = match[1];
	const pipe = inner.lastIndexOf("|");

	return (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
}

/** Frontmatter values are strings, arrays or neither; flatten them to strings. */
export function asStrings(value: unknown): string[] {
	if (typeof value === "string") {
		return value.trim().length > 0 ? [value] : [];
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return [String(value)];
	}

	if (Array.isArray(value)) {
		return value.flatMap(asStrings);
	}

	return [];
}

/** Strips the frontmatter block using the cache's own offsets, not a regex. */
export function bodyWithoutFrontmatter(app: App, file: TFile, raw: string): string {
	const end = app.metadataCache.getFileCache(file)?.frontmatterPosition?.end;

	if (end === undefined) {
		return raw;
	}

	return raw.slice(end.offset).replace(/^\n+/, "");
}

/**
 * Slices out `#heading` or `#^block`, or the whole body when there's no
 * subpath. The cache's offsets index the raw file, so the slicing happens there
 * and the frontmatter is dropped afterwards. Null means the subpath is missing.
 */
export function extractSection(
	app: App,
	file: TFile,
	raw: string,
	subpath: string,
): string | null {
	if (subpath.length === 0) {
		return bodyWithoutFrontmatter(app, file, raw);
	}

	const cache = app.metadataCache.getFileCache(file);

	if (subpath.startsWith("^")) {
		const block = cache?.blocks?.[subpath.slice(1).toLowerCase()];

		if (!block) {
			return null;
		}

		return raw
			.slice(block.position.start.offset, block.position.end.offset)
			.replace(/[ \t]+\^[A-Za-z0-9-]+$/, "")
			.trim();
	}

	const headings = cache?.headings ?? [];
	const index = headings.findIndex(
		(heading) => heading.heading.toLowerCase() === subpath.toLowerCase(),
	);
	const start = headings[index];

	if (!start) {
		return null;
	}

	const next = headings
		.slice(index + 1)
		.find((heading) => heading.level <= start.level);

	return raw
		.slice(
			start.position.start.offset,
			next === undefined ? raw.length : next.position.start.offset,
		)
		.trim();
}

/** Level of the last heading before `index`, or 0 when there isn't one. */
export function headingLevelBefore(text: string, index: number): number {
	let level = 0;

	for (const line of text.slice(0, index).split("\n")) {
		const heading = /^(#{1,6})\s+\S/.exec(line);

		if (heading?.[1]) {
			level = heading[1].length;
		}
	}

	return level;
}

/**
 * Pushes a transcluded note's headings down so its shallowest one sits at
 * `target`, keeping the relative structure of the embedded note intact.
 */
export function demoteHeadings(markdown: string, target: number): string {
	const shallowest = minHeadingLevel(markdown);
	const shift = Math.min(target, 6) - shallowest;

	if (shift <= 0) {
		return markdown;
	}

	return markdown.replace(
		/^(#{1,6})(\s+\S)/gm,
		(whole, hashes: string, rest: string) =>
			"#".repeat(Math.min(hashes.length + shift, 6)) + rest,
	);
}

/**
 * Shallowest ATX heading level in the document, ignoring fenced code so a `#`
 * comment in a shell snippet doesn't masquerade as a chapter.
 */
export function minHeadingLevel(markdown: string): number {
	let level = 7;
	let inFence = false;

	for (const line of markdown.split("\n")) {
		if (FENCE.test(line)) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		const heading = /^(#{1,6})\s+\S/.exec(line);

		if (heading?.[1]) {
			level = Math.min(level, heading[1].length);
		}
	}

	return level === 7 ? 1 : level;
}
