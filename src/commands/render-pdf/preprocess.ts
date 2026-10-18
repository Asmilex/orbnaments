import { App, TFile } from "obsidian";
import {
	FENCE,
	demoteHeadings,
	extractSection,
	headingLevelBefore,
	maskCode,
	replaceAsync,
	splitTarget,
} from "../../utils/obsidian-markdown";
import type { AssetRequest, PdfContentOptions } from "./types";
import { typstContent } from "./typst";

/** Nesting limit for `![[note]]` transclusion, so a cycle can't run away. */
const MAX_EMBED_DEPTH = 4;

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"svg",
	"webp",
	"bmp",
]);

const MASK_OPEN = "";
const MASK_CLOSE = "";

const CALLOUT_HEAD = /^\s{0,3}>\s*\[!(\w+)\]([+-]?)\s*(.*)$/;

export interface PreprocessResult {
	markdown: string;
	assets: AssetRequest[];
	warnings: string[];
}

/**
 * Rewrites Obsidian-flavoured markdown into something pandoc understands.
 *
 * Links and embeds are resolved through the metadata cache, so the plugin
 * inherits Obsidian's own link resolution rather than guessing at file paths.
 * Code spans, fenced blocks and display math are masked before any rewriting
 * happens and restored at the very end, so a `[[link]]` inside a code block
 * survives verbatim.
 */
export class Preprocessor {
	private readonly masked: string[] = [];
	private readonly assets = new Map<string, AssetRequest>();
	private readonly warnings: string[] = [];

	constructor(
		private readonly app: App,
		private readonly options: PdfContentOptions,
	) {}

	async run(markdown: string, sourcePath: string): Promise<PreprocessResult> {
		const transformed = await this.transform(markdown, sourcePath, 0, [
			sourcePath,
		]);

		return {
			markdown: this.unmask(transformed),
			assets: [...this.assets.values()],
			warnings: this.warnings,
		};
	}

	private async transform(
		markdown: string,
		sourcePath: string,
		depth: number,
		stack: string[],
	): Promise<string> {
		let text = this.extractCallouts(markdown);
		text = this.maskCode(text);
		text = text.replace(/%%[\s\S]*?%%/g, "");
		text = this.maskDisplayMath(text);
		// Before the embeds: those emit `assets/…` paths that are already resolved.
		text = this.resolveMarkdownImages(text, sourcePath);
		text = await this.resolveEmbeds(text, sourcePath, depth, stack);
		text = this.resolveWikilinks(text);

		return text.replace(/[ \t]+\^[A-Za-z0-9-]+$/gm, "");
	}

	// ── masking ───────────────────────────────────────────────────────────────

	private mask(literal: string): string {
		this.masked.push(literal);
		return `${MASK_OPEN}${this.masked.length - 1}${MASK_CLOSE}`;
	}

	private unmask(text: string): string {
		return text.replace(
			new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, "g"),
			(whole, index: string) => this.masked[Number(index)] ?? whole,
		);
	}

	private maskCode(text: string): string {
		return maskCode(text, (literal) => this.mask(literal));
	}

	private maskDisplayMath(text: string): string {
		return text.replace(/\$\$[\s\S]*?\$\$/g, (whole) => this.mask(whole));
	}

	// ── callouts ──────────────────────────────────────────────────────────────

	/**
	 * `> [!tip] Title` becomes a raw Typst block wrapping the (still markdown)
	 * body, which pandoc passes through untouched. The body therefore keeps its
	 * formatting instead of collapsing into a bold-first-line blockquote.
	 */
	private extractCallouts(markdown: string): string {
		const lines = markdown.split("\n");
		const out: string[] = [];
		let inFence = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";

			if (FENCE.test(line)) {
				inFence = !inFence;
				out.push(line);
				continue;
			}

			const head = inFence ? null : CALLOUT_HEAD.exec(line);

			if (!head) {
				out.push(line);
				continue;
			}

			const body: string[] = [];
			let next = i + 1;

			while (next < lines.length && /^\s{0,3}>/.test(lines[next] ?? "")) {
				body.push((lines[next] ?? "").replace(/^\s{0,3}>[ \t]?/, ""));
				next++;
			}

			i = next - 1;

			const kind = (head[1] ?? "note").toLowerCase();
			const rawTitle = (head[3] ?? "").trim();
			const title =
				rawTitle.length > 0
					? rawTitle
					: kind.charAt(0).toUpperCase() + kind.slice(1);

			out.push(
				"",
				this.mask(
					'```{=typst}\n#orb-callout("' +
						kind +
						'", [' +
						typstContent(title) +
						"])[\n```",
				),
				"",
				this.extractCallouts(body.join("\n")),
				"",
				this.mask("```{=typst}\n]\n```"),
				"",
			);
		}

		return out.join("\n");
	}

	// ── links, embeds and images ──────────────────────────────────────────────

	private async resolveEmbeds(
		text: string,
		sourcePath: string,
		depth: number,
		stack: string[],
	): Promise<string> {
		return replaceAsync(
			text,
			/!\[\[([^\]\n]+)\]\]/g,
			async (match) =>
				await this.resolveEmbed(match[1] ?? "", sourcePath, depth, {
					stack,
					enclosingHeading: headingLevelBefore(text, match.index),
				}),
		);
	}

	private async resolveEmbed(
		target: string,
		sourcePath: string,
		depth: number,
		context: { stack: string[]; enclosingHeading: number },
	): Promise<string> {
		const { stack, enclosingHeading } = context;

		const { linkpath, subpath, display } = splitTarget(target);
		const file = this.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			sourcePath,
		);

		if (!file) {
			this.warnings.push(`Unresolved embed: ![[${target}]]`);
			return `*${linkpath}*`;
		}

		if (IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
			return this.imageMarkdown(file, display);
		}

		if (file.extension.toLowerCase() !== "md") {
			this.warnings.push(
				`Embedded ${file.extension} files can't go in the PDF: ${file.path}`,
			);
			return `*${file.basename}*`;
		}

		if (!this.options.expandEmbeddedNotes) {
			return `*${file.basename}*`;
		}

		if (depth >= MAX_EMBED_DEPTH || stack.includes(file.path)) {
			this.warnings.push(
				`Stopped expanding embeds at ${file.path} (too deep, or a cycle).`,
			);
			return `*${file.basename}*`;
		}

		const raw = await this.app.vault.cachedRead(file);
		const section = extractSection(this.app, file, raw, subpath);

		if (section === null) {
			this.warnings.push(`Unresolved embed section: ![[${target}]]`);
			return `*${file.basename}*`;
		}

		const expanded = await this.transform(section, file.path, depth + 1, [
			...stack,
			file.path,
		]);

		return `\n\n${demoteHeadings(expanded, enclosingHeading + 1)}\n\n`;
	}

	private resolveMarkdownImages(text: string, sourcePath: string): string {
		return text.replace(
			/!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(\s+"[^"]*")?\s*\)/g,
			(whole, alt: string, href: string, title: string | undefined) => {
				const resolved = this.resolveImageHref(href, sourcePath);

				if (resolved === null) {
					return whole;
				}

				return `![${alt}](${resolved}${title ?? ""})`;
			},
		);
	}

	/** Returns the build-relative path for an image href, or null to leave it alone. */
	private resolveImageHref(href: string, sourcePath: string): string | null {
		if (href.startsWith("http://") || href.startsWith("https://")) {
			return this.registerRemote(href);
		}

		if (href.startsWith("data:")) {
			return null;
		}

		const decoded = decodeURIComponent(href);
		const file = this.app.metadataCache.getFirstLinkpathDest(
			decoded,
			sourcePath,
		);

		if (!file) {
			this.warnings.push(`Missing image: ${href}`);
			return null;
		}

		return this.registerFile(file);
	}

	private imageMarkdown(file: TFile, display: string): string {
		const path = this.registerFile(file);
		const size = /^(\d+)(?:x(\d+))?$/.exec(display.trim());

		if (!size?.[1]) {
			return `![](${path})`;
		}

		const height = size[2] ? ` height=${size[2]}px` : "";

		return `![](${path}){width=${size[1]}px${height}}`;
	}

	private registerFile(file: TFile): string {
		const existing = this.assets.get(file.path);

		if (existing) {
			return `assets/${existing.fileName}`;
		}

		const fileName = `a${this.assets.size}.${file.extension.toLowerCase()}`;
		this.assets.set(file.path, { fileName, file });

		return `assets/${fileName}`;
	}

	private registerRemote(url: string): string {
		const existing = this.assets.get(url);

		if (existing) {
			return `assets/${existing.fileName}`;
		}

		const guessed = /\.([a-z0-9]{2,4})(?:$|[?#])/i.exec(url)?.[1];
		const extension = guessed?.toLowerCase();

		if (!extension || !IMAGE_EXTENSIONS.has(extension)) {
			this.warnings.push(
				`Could not tell the image type of ${url}; assuming PNG.`,
			);
		}

		const fileName = `a${this.assets.size}.${
			extension && IMAGE_EXTENSIONS.has(extension) ? extension : "png"
		}`;
		this.assets.set(url, { fileName, url });

		return `assets/${fileName}`;
	}

	private resolveWikilinks(text: string): string {
		if (this.options.wikilinks === "keep") {
			return text;
		}

		return text.replace(/\[\[([^\]\n]+)\]\]/g, (whole, inner: string) => {
			const { linkpath, display } = splitTarget(inner);
			const label = display.length > 0 ? display : linkpath;

			if (this.options.wikilinks === "link") {
				return `[${label}](${encodeURI(linkpath)})`;
			}

			return label;
		});
	}
}
