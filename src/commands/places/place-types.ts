import { App, TFile } from "obsidian";
import { asStrings } from "../../utils/obsidian-markdown";
import { categoryKey, linkedNames } from "../../utils/categories";

/** `leisure=pitch & sport=tennis`: every condition has to hold; `*` takes any value. */
type Rule = { key: string; value: string }[];

function parseRule(text: string): Rule {
	return text
		.split("&")
		.map((condition) => condition.trim().split("="))
		.filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1])
		.map(([key, value]) => ({ key: key.trim(), value: value.trim() }));
}

/** Photon's kind of area, as the `place=*` tag that names it. */
const KIND_AS_PLACE: Record<string, string> = {
	city: "city",
	district: "suburb",
	county: "county",
	state: "state",
	country: "country",
};

/**
 * The vault's place types: categories that descend from the places category
 * (`[[lugares]]`). Found by name or alias like any category, and by the OSM
 * tags in their `osm` property. A category's first parent is its place parent;
 * the rest are topics.
 */
export class PlaceTypes {
	private readonly byKey = new Map<string, TFile>();
	private readonly parents = new Map<TFile, TFile[]>();
	private readonly rules: { type: TFile; rule: Rule; wildcard: boolean }[] = [];
	private readonly types = new Set<TFile>();
	readonly root: TFile | null;

	constructor(
		private readonly app: App,
		folder: string,
		rootName: string,
	) {
		const prefix = folder ? `${folder.replace(/\/$/, "")}/` : null;

		for (const file of app.vault.getMarkdownFiles()) {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
			const filedUnder = linkedNames(frontmatter?.categories);
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
				filedUnder
					.map((name) => app.metadataCache.getFirstLinkpathDest(name, file.path))
					.filter((parent): parent is TFile => parent !== null && parent !== file),
			);
		}

		this.root = this.findAny(rootName);

		for (const file of this.parents.keys()) {
			if (this.root && this.isA(file, this.root)) {
				this.types.add(file);

				for (const text of asStrings(app.metadataCache.getFileCache(file)?.frontmatter?.osm)) {
					const rule = parseRule(text);

					if (rule.length > 0) {
						this.rules.push({ type: file, rule, wildcard: rule.some((c) => c.value === "*") });
					}
				}
			}
		}
	}

	get size(): number {
		return this.types.size;
	}

	isType(file: TFile | null): file is TFile {
		return file !== null && this.types.has(file);
	}

	/** Any category, by name or alias, singular or plural. */
	private findAny(name: string): TFile | null {
		const key = categoryKey(name);

		return (
			this.byKey.get(key) ??
			this.byKey.get(`${key}s`) ??
			(key.endsWith("s") ? this.byKey.get(key.slice(0, -1)) : undefined) ??
			null
		);
	}

	/** A place type, by name or alias. */
	find(name: string): TFile | null {
		const found = this.findAny(name);

		return this.isType(found) ? found : null;
	}

	/** Whether `type` is `ancestor` or files under it, through any parent. */
	isA(type: TFile, ancestor: TFile): boolean {
		const seen = new Set<TFile>();
		const stack = [type];

		while (stack.length > 0) {
			const current = stack.pop();

			if (!current || seen.has(current)) {
				continue;
			}

			if (current === ancestor) {
				return true;
			}

			seen.add(current);
			stack.push(...(this.parents.get(current) ?? []));
		}

		return false;
	}

	/** Steps from the root along place parents; deeper is more specific. */
	depth(type: TFile, seen: Set<TFile> = new Set()): number {
		const parents = (this.parents.get(type) ?? []).filter(
			(parent) => this.types.has(parent) && !seen.has(parent),
		);

		if (parents.length === 0) {
			return 0;
		}

		seen.add(type);

		return 1 + Math.max(...parents.map((parent) => this.depth(parent, new Set(seen))));
	}

	/** The first of a note's categories that is a place type. */
	typeOf(file: TFile): TFile | null {
		const categories = linkedNames(this.app.metadataCache.getFileCache(file)?.frontmatter?.categories);

		for (const name of categories) {
			const category = this.app.metadataCache.getFirstLinkpathDest(name, file.path);

			if (this.isType(category)) {
				return category;
			}
		}

		return null;
	}

	icon(type: TFile | null): string | null {
		const icon: unknown = type ? this.app.metadataCache.getFileCache(type)?.frontmatter?.icon : null;

		return typeof icon === "string" && icon ? icon : null;
	}

	/**
	 * The place type OSM's tags stand for, or null. Tags come main one first,
	 * `{ amenity: "restaurant", cuisine: "japanese" }`; `kind` is Photon's kind
	 * of area, which is all an administrative boundary says about itself.
	 *
	 * In order: `osm` rules and names (`japanese restaurant` from the cuisine
	 * and the main tag, `ice cream` from `amenity=ice_cream`), the most
	 * specific winning; then the kind of area; then wildcard rules (`shop=*`).
	 */
	classify(tags: Record<string, string>, kind = ""): TFile | null {
		const values = new Map(
			Object.entries(tags).map(([key, value]) => [key, value.split(";").map((v) => v.trim())]),
		);
		const has = (key: string, value: string) =>
			values.has(key) && (value === "*" || (values.get(key) ?? []).includes(value));
		const specific: TFile[] = [];
		const wildcard: TFile[] = [];

		for (const { type, rule, wildcard: isWildcard } of this.rules) {
			if (rule.every(({ key, value }) => has(key, value))) {
				(isWildcard ? wildcard : specific).push(type);
			}
		}

		const main = Object.entries(tags)[0];

		if (main) {
			const value = main[1].replace(/_/g, " ");

			for (const cuisine of values.get("cuisine") ?? []) {
				const compound = this.find(`${cuisine.replace(/_/g, " ")} ${value}`);

				if (compound) {
					specific.push(compound);
				}
			}

			const named = this.find(value);

			if (named) {
				specific.push(named);
			}
		}

		const deepest = (found: TFile[]) =>
			found.reduce<TFile | null>(
				(best, type) => (best === null || this.depth(type) > this.depth(best) ? type : best),
				null,
			);

		if (specific.length > 0 && main?.[0] !== "boundary") {
			return deepest(specific);
		}

		const asPlace = KIND_AS_PLACE[kind];

		if (asPlace && tags.place !== asPlace) {
			const area = this.classify({ place: asPlace });

			if (area) {
				return area;
			}
		}

		return deepest([...specific, ...wildcard]);
	}
}

const TOWN_LEVELS = ["village", "town", "city", "municipality"];

/** Notes of places, by name and alias, to point `localizacion` at. */
export class PlaceNotes {
	private readonly byKey = new Map<string, TFile>();

	constructor(
		app: App,
		private readonly types: PlaceTypes,
	) {
		for (const file of app.vault.getMarkdownFiles()) {
			if (!types.typeOf(file)) {
				continue;
			}

			const aliases = asStrings(app.metadataCache.getFileCache(file)?.frontmatter?.aliases);

			for (const name of [file.basename, ...aliases]) {
				const key = categoryKey(name);

				if (key && !this.byKey.has(key)) {
					this.byKey.set(key, file);
				}
			}
		}
	}

	find(name: string): TFile | null {
		return this.byKey.get(categoryKey(name)) ?? null;
	}

	/**
	 * The most specific part of an address that has a note of the right kind:
	 * the city of Granada for `city: Granada`, never for `province: Granada`.
	 * Levels at or below the note's own kind are skipped, so a city lands in
	 * its region and never in itself. A town without a note still counts, as
	 * a link to a note yet to exist, rather than climbing to its region.
	 */
	containerFor(
		address: { level: string; name: string }[],
		self: TFile,
	): { file: TFile | null; name: string } | null {
		const own = this.types.typeOf(self);

		for (const { level, name } of address) {
			const expected = this.types.classify({ place: level === "municipality" ? "city" : level });

			// The note is this kind of place itself: Almería for `city: Almería`.
			if (own && expected && this.types.isA(own, expected)) {
				continue;
			}

			// Bilingual names, `Arrasate / Mondragón`, match by any of their parts.
			const parts = [name, ...name.split("/").map((part) => part.trim())];

			for (const part of parts) {
				const note = this.find(part);
				const type = note ? this.types.typeOf(note) : null;

				if (
					note &&
					note !== self &&
					expected &&
					type &&
					(this.types.isA(type, expected) || this.types.isA(expected, type))
				) {
					return { file: note, name: part };
				}
			}

			if (TOWN_LEVELS.includes(level)) {
				return { file: null, name: parts[1] ?? name };
			}
		}

		return null;
	}
}
