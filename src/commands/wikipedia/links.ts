import { maskCode } from "../../utils/obsidian-markdown";

/**
 * Rewriting of links to Wikipedia articles inside markdown. Pure string work,
 * so the vault lookup comes in as a callback.
 */

export interface WikiTarget {
	lang: string;
	/** Spaces, not underscores, and percent-decoded. */
	title: string;
	fragment: string;
}

export interface RewriteOptions {
	/** Language for links relative to the wiki, `/wiki/Foo`. */
	lang: string;
	/** Linktext of the note standing for the article, or null if there's none. */
	resolve: (target: WikiTarget) => string | null;
}

export interface RewriteStats {
	/** Links that now point at a note in the vault. */
	linked: number;
	/** Relative `/wiki/…` links made absolute so they work outside Wikipedia. */
	absolutized: number;
	/** Links to articles that don't exist, turned into plain text. */
	unlinked: number;
}

const MASK_OPEN = "\u{F0002}";
const MASK_CLOSE = "\u{F0003}";

/**
 * Namespaces that aren't articles, in English and Spanish. Their links stay
 * pointing at Wikipedia.
 */
const NON_ARTICLE =
	/^(?:File|Image|Category|Help|Special|Template|Talk|User|Wikipedia|Portal|Draft|Module|MediaWiki|Book|TimedText|Archivo|Imagen|Categoría|Ayuda|Especial|Plantilla|Discusión|Usuario|Anexo|Wikiproyecto)(?: talk)?:/i;

const WIKI_HOST = String.raw`https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org`;

/**
 * `[text](url "title")` where url points at a wiki page. Text allows one level
 * of nested brackets (image links); url allows backslash escapes and one level
 * of balanced parentheses, as in `Monoid_\(category_theory\)`.
 */
const MARKDOWN_LINK = new RegExp(
	String.raw`(!?)\[((?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*)\]\(((?:${WIKI_HOST})?\/wiki\/(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))*)(\s+"(?:\\.|[^"\\])*")?\)`,
	"g",
);

/** Unescapes the backslash escapes that turndown adds. */
function unescapeMarkdown(text: string): string {
	return text.replace(/\\([\\`*_{}[\]()#+\-.!|~<>=])/g, "$1");
}

function decode(text: string): string {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

/**
 * Reads a `/wiki/…` url, absolute or relative. Null for anything that isn't an
 * article: other namespaces, edit links, malformed input.
 */
export function parseWikiUrl(url: string, defaultLang: string): WikiTarget | null {
	const match = new RegExp(
		String.raw`^(?:${WIKI_HOST})?\/wiki\/([^?#]+)(?:#(.*))?$`,
	).exec(unescapeMarkdown(url));

	if (!match?.[2]) {
		return null;
	}

	const title = decode(match[2]).replace(/_/g, " ").trim();

	if (title.length === 0 || NON_ARTICLE.test(title)) {
		return null;
	}

	return {
		lang: match[1] ?? defaultLang,
		title,
		fragment: decode(match[3] ?? "").replace(/_/g, " ").trim(),
	};
}

/** Every article a markdown link points at, in order, repeats included. */
export function wikiTargetsIn(markdown: string, lang: string): WikiTarget[] {
	const pattern = new RegExp(MARKDOWN_LINK.source, "g");
	const targets: WikiTarget[] = [];
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(markdown)) !== null) {
		const url = match[3] ?? "";

		if (match[1] || /[?&]redlink=1/.test(url)) {
			continue;
		}

		const target = parseWikiUrl(url, lang);

		if (target) {
			targets.push(target);
		}
	}

	return targets;
}

/** The way titles are compared: no underscores, spacing or case differences. */
export function normalizeTitle(title: string): string {
	return title
		.normalize("NFC")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/**
 * `[[target|display]]`, keeping emphasis that wrapped the whole link text
 * outside the brackets, since Obsidian shows a wikilink's display text
 * literally. Null when the text can't live inside a wikilink.
 */
function wikilink(
	linktext: string,
	fragment: string,
	text: string,
	inTable: boolean,
): string | null {
	let display = unescapeMarkdown(text).trim();
	let wrap = "";

	const emphasis = /^(\*{1,3}|_{1,3})(.+)\1$/.exec(display);

	if (emphasis?.[1] && emphasis[2]) {
		wrap = emphasis[1];
		display = emphasis[2];
	}

	if (/\[\[|\]\]|[|\n]/.test(display) || display.length === 0) {
		return null;
	}

	const safeFragment = /[|#[\]^]/.test(fragment) ? "" : fragment;
	const target = safeFragment ? `${linktext}#${safeFragment}` : linktext;
	const separator = inTable ? "\\|" : "|";
	const inner = display === target ? target : `${target}${separator}${display}`;

	return `${wrap}[[${inner}]]${wrap}`;
}

/**
 * Points every link to a Wikipedia article at the note in the vault that stands
 * for it, if there is one; otherwise leaves an absolute link to Wikipedia,
 * which a later run can upgrade once the note exists. Links to missing articles
 * become plain text. Code is left alone.
 */
export function rewriteWikipediaLinks(
	markdown: string,
	options: RewriteOptions,
): { text: string; stats: RewriteStats } {
	const stats: RewriteStats = { linked: 0, absolutized: 0, unlinked: 0 };
	const masked: string[] = [];
	const text = maskCode(markdown, (literal) => {
		masked.push(literal);
		return `${MASK_OPEN}${masked.length - 1}${MASK_CLOSE}`;
	});

	const rewritten = text
		.split("\n")
		.map((line) => {
			const inTable = /^\s*\|/.test(line);

			return line.replace(
				MARKDOWN_LINK,
				(whole, bang: string, label: string, url: string, _lang, title = "") => {
					if (bang) {
						return whole;
					}

					if (/[?&]redlink=1/.test(url)) {
						stats.unlinked++;
						return label;
					}

					const target = parseWikiUrl(url, options.lang);
					const linktext = target ? options.resolve(target) : null;

					if (target && linktext) {
						const link = wikilink(linktext, target.fragment, label, inTable);

						if (link) {
							stats.linked++;
							return link;
						}
					}

					if (url.startsWith("/")) {
						stats.absolutized++;
						return `[${label}](https://${options.lang}.wikipedia.org${url}${title})`;
					}

					return whole;
				},
			);
		})
		.join("\n")
		// Raw HTML (infoboxes from older clippings) can't hold wikilinks, but
		// its links can at least leave the vault in one piece.
		.replace(/(\shref=")\/wiki\//g, (whole, attribute: string) => {
			stats.absolutized++;
			return `${attribute}https://${options.lang}.wikipedia.org/wiki/`;
		});

	return {
		text: rewritten.replace(
			new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, "g"),
			(whole, index: string) => masked[Number(index)] ?? whole,
		),
		stats,
	};
}
