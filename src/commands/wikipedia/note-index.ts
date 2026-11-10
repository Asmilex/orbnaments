import { App, TFile } from "obsidian";
import { asStrings } from "../../utils/obsidian-markdown";
import { WikiTarget, normalizeTitle, parseWikiUrl } from "./links";

/** Which notes stand for which Wikipedia articles. */
export class NoteIndex {
	/**
	 * `en:monoid` for a note whose `link` is that article, `*:monoid` for one
	 * named or aliased like it. Lower rank wins when two notes collide.
	 */
	private readonly entries = new Map<string, { file: TFile; rank: number }>();

	constructor(private readonly app: App) {
		for (const file of app.vault.getMarkdownFiles()) {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;

			for (const link of asStrings(frontmatter?.link)) {
				const article = parseWikiUrl(link, "en");

				if (article) {
					this.add(`${article.lang}:${normalizeTitle(article.title)}`, file, 0);
				}
			}

			this.add(`*:${normalizeTitle(file.basename)}`, file, 1);

			for (const alias of asStrings(frontmatter?.aliases)) {
				this.add(`*:${normalizeTitle(alias)}`, file, 2);
			}
		}
	}

	private add(key: string, file: TFile, rank: number) {
		const current = this.entries.get(key);

		if (!current || rank < current.rank) {
			this.entries.set(key, { file, rank });
		}
	}

	find(target: WikiTarget): TFile | null {
		const title = normalizeTitle(target.title);

		return (
			this.entries.get(`${target.lang}:${title}`)?.file ??
			this.entries.get(`*:${title}`)?.file ??
			null
		);
	}

	/** Linktext as seen from `sourcePath`, never the note itself. */
	resolver(sourcePath: string): (target: WikiTarget) => string | null {
		return (target) => {
			const file = this.find(target);

			if (!file || file.path === sourcePath) {
				return null;
			}

			return this.app.metadataCache.fileToLinktext(file, sourcePath, true);
		};
	}
}
