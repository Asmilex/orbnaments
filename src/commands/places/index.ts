import { App, Notice, TFile, moment, normalizePath } from "obsidian";
import type OrbnamentsPlugin from "../../main";
import { asStrings, stripWikilink } from "../../utils/obsidian-markdown";
import { categoryKey, linkedNames } from "../../utils/categories";
import { COORDINATES_ONLY, distance, pickPlace } from "../../ui/place-search-modal";
import { LatLng, PlaceDetails, addressAt, osmUrl, parseOsmUrl, placeDetails } from "./api";
import { PlaceNotes, PlaceTypes } from "./place-types";

/** Further than this from the note's own coordinates gets mentioned. */
const FAR_METRES = 250;

function toNumber(value: unknown): number | null {
	const number = typeof value === "number" ? value : parseFloat(String(value));

	return Number.isFinite(number) ? number : null;
}

/**
 * A note's coordinates: `coordinates: [lat, lng]`, `coordinates: "lat, lng"`,
 * or the older `latitude` and `longitude`.
 */
export function readCoordinates(frontmatter: Record<string, unknown> | undefined): LatLng | null {
	const raw = frontmatter?.coordinates;
	const pair = Array.isArray(raw)
		? raw
		: typeof raw === "string"
			? raw.split(",")
			: [frontmatter?.latitude, frontmatter?.longitude];
	const lat = toNumber(pair[0]);
	const lng = toNumber(pair[1]);

	return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

/** `Retiro (Parque)` -> `Retiro` and `Parque`. */
function splitQualifier(name: string): { base: string; qualifier: string | null } {
	const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(name);

	return match?.[1] && match[2] ? { base: match[1], qualifier: match[2] } : { base: name, qualifier: null };
}

/** The notes a note is in, through `localizacion`, nearest first. */
function containers(app: App, file: TFile, levels = 6): TFile[] {
	const found: TFile[] = [];
	let current = [file];

	for (let level = 0; level < levels && current.length > 0; level++) {
		const next: TFile[] = [];

		for (const note of current) {
			const names = linkedNames(app.metadataCache.getFileCache(note)?.frontmatter?.localizacion);

			for (const name of names) {
				const parent = app.metadataCache.getFirstLinkpathDest(name, note.path);

				if (parent && parent !== file && !found.includes(parent)) {
					found.push(parent);
					next.push(parent);
				}
			}
		}

		current = next;
	}

	return found;
}

/** What to search for, and around where. */
function searchContext(app: App, file: TFile, types: PlaceTypes, notes: PlaceNotes) {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const own = readCoordinates(frontmatter);
	const { base, qualifier } = splitQualifier(file.basename);
	const wanted = qualifier ? types.find(qualifier) : null;
	const qualifierPlace = qualifier && !wanted ? notes.find(qualifier) : null;
	const around = [...(qualifierPlace ? [qualifierPlace] : []), ...containers(app, file)];
	const aroundWithCoordinates = around
		.map((note) => readCoordinates(app.metadataCache.getFileCache(note)?.frontmatter))
		.find((coordinates) => coordinates !== null);

	// A qualifier that is neither a type nor a place is part of the name.
	let text = qualifier && !wanted && !qualifierPlace ? `${base} ${qualifier}` : base;
	const town = around[0];

	if (!own && town && !categoryKey(text).includes(categoryKey(town.basename))) {
		text = `${text} ${town.basename}`;
	}

	return { text, near: own ?? aroundWithCoordinates ?? null, own, wanted };
}

/** Words too common to say two names are about the same thing. */
const FILLER = new Set(["de", "del", "la", "las", "el", "los", "the", "and", "y", "of", "en"]);

function words(name: string): string[] {
	return categoryKey(name)
		.split(" ")
		.filter((word) => word.length > 1 && !FILLER.has(word));
}

/**
 * Whether OSM's name for the match can become an alias of the note: it has to
 * share a word with the note's name, and no other note may already go by it,
 * or links meant for that one would land here. Picking the Monasterio de
 * Piedra for a note about its park mustn't take over [[Monasterio de Piedra]].
 */
function fitsAsAlias(app: App, name: string, file: TFile): boolean {
	const own = new Set(words(file.basename));

	if (!words(name).some((word) => own.has(word))) {
		return false;
	}

	const key = categoryKey(name);

	return !app.vault.getMarkdownFiles().some((other) => {
		if (other === file) {
			return false;
		}

		const aliases = asStrings(app.metadataCache.getFileCache(other)?.frontmatter?.aliases);

		return [other.basename, ...aliases].some((known) => categoryKey(known) === key);
	});
}

function link(app: App, file: TFile, from: TFile): string {
	return `[[${app.metadataCache.fileToLinktext(file, from.path, true)}]]`;
}

interface Filled {
	type: string | null;
	typeAdded: boolean;
	container: string | null;
	coordinatesAdded: boolean;
	far: number | null;
}

/**
 * Merges what OSM knows into the note, keeping what's there: the place type
 * joins the categories (first if the note has no place type yet), the
 * container joins `localizacion`, and coordinates, the OSM link and the
 * creation date fill in only when missing.
 */
async function merge(
	plugin: OrbnamentsPlugin,
	file: TFile,
	types: PlaceTypes,
	notes: PlaceNotes,
	details: PlaceDetails | null,
	address: { level: string; name: string }[],
	kind: string,
): Promise<Filled> {
	const { app } = plugin;
	const type = details ? types.classify(details.tags, kind) : null;
	const container = notes.containerFor(address, file);
	const filled: Filled = {
		type: type?.basename ?? null,
		typeAdded: false,
		container: container?.name ?? null,
		coordinatesAdded: false,
		far: null,
	};

	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		const resolve = (name: string) => app.metadataCache.getFirstLinkpathDest(name, file.path);

		// Categories
		if (type) {
			const current = asStrings(frontmatter.categories);
			const resolved = linkedNames(frontmatter.categories).map(resolve);
			const covered = resolved.some((c) => c !== null && types.isType(c) && types.isA(c, type));

			if (!covered) {
				const hasType = resolved.some((c) => types.isType(c) && c !== types.root);
				const entry = link(app, type, file);

				frontmatter.categories = hasType ? [...current, entry] : [entry, ...current];
				filled.typeAdded = true;
			}
		}

		// Coordinates, moving the older pair of properties into one.
		const own = readCoordinates(frontmatter);

		if (own) {
			if (!Array.isArray(frontmatter.coordinates)) {
				frontmatter.coordinates = own;
				delete frontmatter.latitude;
				delete frontmatter.longitude;
			}

			if (details) {
				const metres = distance(own, details.coordinates);
				filled.far = metres > FAR_METRES ? metres : null;
			}
		} else if (details) {
			frontmatter.coordinates = details.coordinates.map((n) => Math.round(n * 1e6) / 1e6);
			filled.coordinatesAdded = true;
		}

		// Where it is
		if (container) {
			const current = asStrings(frontmatter.localizacion);
			const existing = linkedNames(frontmatter.localizacion).map(resolve);
			const target = container.file;
			const already = target
				? existing.some(
						(note) => note !== null && (note === target || containers(app, note).includes(target)),
					)
				: current.some((entry) => categoryKey(stripWikilink(entry)) === categoryKey(container.name));

			if (!already) {
				const entry = target ? link(app, target, file) : `[[${container.name}]]`;
				frontmatter.localizacion = [...current, entry];
			} else {
				filled.container = null;
			}
		}

		// The rest only fills gaps.
		if (details) {
			const osm = asStrings(frontmatter.osm)[0];

			if (!osm || !parseOsmUrl(osm)) {
				frontmatter.osm = osmUrl(details.ref);
			}

			const aliases = asStrings(frontmatter.aliases);
			const name = details.name.trim();
			const known = [file.basename, splitQualifier(file.basename).base, ...aliases].map(categoryKey);

			if (name && !known.includes(categoryKey(name)) && fitsAsAlias(app, name, file)) {
				frontmatter.aliases = [...aliases, name];
			}
		}

		frontmatter.created ??= moment().format("YYYY-MM-DD");
	});

	return filled;
}

/** Empty notes move to the places folder, unless one there has the name. */
async function placeInFolder(plugin: OrbnamentsPlugin, file: TFile, wasEmpty: boolean): Promise<void> {
	const folder = plugin.settings.placesFolder.trim();

	if (!folder || !wasEmpty) {
		return;
	}

	const target = normalizePath(folder);

	if (file.path.startsWith(`${target}/`)) {
		return;
	}

	const path = normalizePath(`${target}/${file.name}`);

	if (plugin.app.vault.getAbstractFileByPath(path)) {
		new Notice(`${path} already exists, so the note stayed where it is`);
		return;
	}

	if (!plugin.app.vault.getFolderByPath(target)) {
		await plugin.app.vault.createFolder(target);
	}

	await plugin.app.fileManager.renameFile(file, path);
}

function report(filled: Filled, matched: string | null): string {
	const parts = [
		matched ? `Matched “${matched}”` : "Kept the note's own coordinates",
		filled.type
			? filled.typeAdded
				? `filed under ${filled.type}`
				: `already a ${filled.type}`
			: matched
				? "no place type for it"
				: "",
		filled.container ? `in ${filled.container}` : "",
		filled.coordinatesAdded ? "with its coordinates" : "",
	].filter((part) => part.length > 0);
	const far = filled.far
		? `. OSM puts it ${Math.round(filled.far)} m from the note's coordinates, which stay`
		: "";

	return parts.join(", ") + far;
}

/**
 * Looks the active note up in OpenStreetMap and merges the match into it: a
 * new empty note, a Google Maps clipping or an old place note alike. Asks
 * which result is meant, since the top one is often another place.
 */
export async function fillFromMap(plugin: OrbnamentsPlugin): Promise<void> {
	const { app, settings } = plugin;
	const file = app.workspace.getActiveFile();

	if (!(file instanceof TFile) || file.extension !== "md") {
		new Notice("Open the note to fill first");
		return;
	}

	const types = new PlaceTypes(app, settings.wikipediaCategoryFolder, settings.placesCategory);

	if (types.size === 0) {
		new Notice(`No place types: file categories under [[${settings.placesCategory}]]`);
		return;
	}

	const notes = new PlaceNotes(app, types);
	const context = searchContext(app, file, types, notes);
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const known = parseOsmUrl(asStrings(frontmatter?.osm)[0] ?? "");
	const wasEmpty = (await app.vault.cachedRead(file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim() === "";

	let progress: Notice | null = null;

	try {
		let details: PlaceDetails | null = null;
		let address: { level: string; name: string }[] = [];
		let kind = "";

		if (known) {
			progress = new Notice("Refreshing from OpenStreetMap…", 0);
			details = await placeDetails(settings.placesDetailsUrl, known, settings.placesLanguage);
		} else {
			const choice = await pickPlace(app, {
				serviceUrl: settings.placesSearchUrl,
				language: settings.placesLanguage,
				initial: context.text,
				near: context.near,
				wanted: context.wanted,
				types,
				hasCoordinates: context.own !== null,
			});

			if (choice === null) {
				return;
			}

			progress = new Notice("Asking OpenStreetMap…", 0);

			if (choice === COORDINATES_ONLY) {
				address = context.own ? await addressAt(settings.placesDetailsUrl, context.own, settings.placesLanguage) : [];
			} else {
				kind = choice.kind;
				details = await placeDetails(settings.placesDetailsUrl, choice.ref, settings.placesLanguage);

				if (!details) {
					new Notice("OpenStreetMap has no details for that place");
					return;
				}
			}
		}

		if (details) {
			address = details.address;
		}

		const filled = await merge(plugin, file, types, notes, details, address, kind);

		progress?.hide();
		await placeInFolder(plugin, file, wasEmpty);
		new Notice(report(filled, details?.name ?? null));
	} catch (error) {
		console.error("Filling from the map failed", error);
		new Notice(`Couldn't fill from the map: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		progress?.hide();
	}
}
