import { App, TFile } from "obsidian";
import { asStrings } from "../../utils/obsidian-markdown";
import { categoryKey, linkedNames } from "../../utils/categories";
import { resolveTitles } from "./api";
import { wikiTargetsIn } from "./links";

/** A category note, or a name used as a category before its note exists. */
type Category = TFile | string;

/**
 * The vault's categories: notes filed under `[[categories]]` or living in the
 * categories folder, plus names other notes file themselves under that have no
 * note yet. Found by name or alias, singular or plural.
 */
class CategoryIndex {
	private readonly byKey = new Map<string, Category>();
	/** The categories each category is itself filed under. */
	private readonly parents = new Map<TFile, Set<TFile>>();

	constructor(private readonly app: App, folder: string) {
		const prefix = folder ? `${folder.replace(/\/$/, "")}/` : null;

		const speculative = new Set<string>();

		for (const file of app.vault.getMarkdownFiles()) {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
			const filedUnder = linkedNames(frontmatter?.categories);

			for (const name of filedUnder) {
				if (!app.metadataCache.getFirstLinkpathDest(name, file.path)) {
					speculative.add(name);
				}
			}

			const isCategory =
				filedUnder.some((name) => categoryKey(name) === "categories") ||
				(prefix !== null && file.path.startsWith(prefix));

			if (!isCategory) {
				continue;
			}

			for (const name of [file.basename, ...asStrings(frontmatter?.aliases)]) {
				const key = categoryKey(name);

				if (key && !this.byKey.has(key)) {
					this.byKey.set(key, file);
				}
			}

			this.parents.set(
				file,
				new Set(
					filedUnder
						.map((name) => app.metadataCache.getFirstLinkpathDest(name, file.path))
						.filter((parent): parent is TFile => parent !== null),
				),
			);
		}

		for (const name of speculative) {
			const key = categoryKey(name);

			if (key && !this.byKey.has(key)) {
				this.byKey.set(key, name);
			}
		}
	}

	get size(): number {
		return this.byKey.size;
	}

	find(title: string): Category | null {
		const key = categoryKey(title);

		return (
			this.byKey.get(key) ??
			this.byKey.get(`${key}s`) ??
			(key.endsWith("s") ? this.byKey.get(key.slice(0, -1)) : undefined) ??
			null
		);
	}

	/** Drops categories already implied by a more specific one in the set. */
	mostSpecific(found: Category[]): Category[] {
		return found.filter(
			(category) =>
				typeof category === "string" ||
				!found.some(
					(other) => typeof other !== "string" && this.parents.get(other)?.has(category),
				),
		);
	}
}

/** The lead: everything before the first heading. */
function leadOf(markdown: string): string {
	const heading = /^#{1,6}\s/m.exec(markdown);

	return heading ? markdown.slice(0, heading.index) : markdown;
}

/** `Vertex (graph theory)` -> `graph theory`, the field the title belongs to. */
function qualifier(title: string): string | null {
	return /\(([^()]+)\)\s*$/.exec(title)?.[1] ?? null;
}

/**
 * Categories of the vault that the article's lead links to, directly, through
 * a redirect (`Functional programming language`), by its translation
 * (`Teoría de categorías`), or by a title's qualifier (`Tree (graph theory)`).
 * The article's own qualifier counts too. Takes the markdown before links are
 * rewritten; returns linktext for the frontmatter.
 */
export async function detectCategories(
	app: App,
	markdown: string,
	options: { lang: string; otherLang: string; folder: string; self: TFile; title: string },
): Promise<string[]> {
	const index = new CategoryIndex(app, options.folder);
	const titles = [...new Set(wikiTargetsIn(leadOf(markdown), options.lang).map((t) => t.title))];

	if (index.size === 0) {
		return [];
	}

	const resolved =
		titles.length > 0
			? await resolveTitles(options.lang, titles, options.otherLang)
			: new Map<string, { canonical: string; translation: string | null }>();
	const found: Category[] = [];
	const add = (category: Category | null) => {
		if (category && category !== options.self && !found.includes(category)) {
			found.push(category);
		}
	};
	const firstMatch = (names: (string | null | undefined)[]) =>
		names.map((name) => (name ? index.find(name) : null)).find((c) => c) ?? null;

	const own = qualifier(options.title);
	add(own ? index.find(own) : null);

	// A link's qualifier is weaker evidence than the link itself: `Substitution
	// (algebra)` in a lead about lambda calculus doesn't make it algebra. It
	// counts once two links share it, as `Vertex (graph theory)` and `Tree
	// (graph theory)` do.
	const byQualifier = new Map<Category, number>();

	for (const title of titles) {
		const { canonical, translation } = resolved.get(title) ?? {};
		const names = [title, canonical, translation];

		add(firstMatch(names));

		const category = firstMatch(names.map((name) => (name ? qualifier(name) : null)));

		if (category) {
			byQualifier.set(category, (byQualifier.get(category) ?? 0) + 1);
		}
	}

	for (const [category, count] of byQualifier) {
		if (count >= 2) {
			add(category);
		}
	}

	return index
		.mostSpecific(found)
		.map((category) =>
			typeof category === "string"
				? category
				: app.metadataCache.fileToLinktext(category, options.self.path, true),
		);
}
