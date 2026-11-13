import { requestUrl } from "obsidian";

/**
 * OpenStreetMap through two public services: Photon to search (it allows
 * search as you type) and Nominatim for one place's tags and address. Both
 * can be self-hosted; the base URLs come from the settings.
 */

/** Nominatim's usage policy asks clients to identify themselves. */
const HEADERS = { "User-Agent": "Orbnaments/1.1 (Obsidian plugin)" };

export type LatLng = [number, number];

/** `node/3741085688`, how OSM addresses an object. */
export interface OsmRef {
	type: "node" | "way" | "relation";
	id: number;
}

export interface SearchHit {
	ref: OsmRef;
	name: string;
	/** OSM's main tag, `amenity=cafe`. */
	key: string;
	value: string;
	/** Photon's own kind for areas: `city`, `district`, `state`, `country`… */
	kind: string;
	coordinates: LatLng;
	/** `Calle San Juan de Dios, Granada, España`. */
	address: string;
}

export interface PlaceDetails {
	ref: OsmRef;
	name: string;
	coordinates: LatLng;
	/** The main tag first, then the extra tags that say what the place is. */
	tags: Record<string, string>;
	/** Nominatim's address, most specific part first. */
	address: { level: string; name: string }[];
	website: string | null;
}

const OSM_TYPES: Record<string, OsmRef["type"]> = {
	N: "node",
	W: "way",
	R: "relation",
	node: "node",
	way: "way",
	relation: "relation",
};

export function osmUrl(ref: OsmRef): string {
	return `https://www.openstreetmap.org/${ref.type}/${ref.id}`;
}

/** Reads `https://www.openstreetmap.org/node/123` (or `node/123`) back. */
export function parseOsmUrl(text: string): OsmRef | null {
	const match = /(?:^|\/)(node|way|relation)\/(\d+)\/?$/.exec(text.trim());
	const type = match?.[1] ? OSM_TYPES[match[1]] : undefined;

	return type && match?.[2] ? { type, id: Number(match[2]) } : null;
}

function base(url: string): string {
	return url.trim().replace(/\/+$/, "");
}

interface PhotonResponse {
	features?: {
		geometry?: { coordinates?: [number, number] };
		properties?: Record<string, string | number | undefined>;
	}[];
}

const PHOTON_LANGUAGES = ["en", "de", "fr"];

export async function searchPlaces(
	serviceUrl: string,
	text: string,
	near: LatLng | null,
	language: string,
): Promise<SearchHit[]> {
	if (text.trim().length === 0) {
		return [];
	}

	// Photon speaks few languages; otherwise names stay as the place has them.
	const lang = PHOTON_LANGUAGES.includes(language) ? language : "default";
	const params = new URLSearchParams({ q: text, limit: "10", lang });

	if (near) {
		params.set("lat", String(near[0]));
		params.set("lon", String(near[1]));
	}

	const response = await requestUrl({
		url: `${base(serviceUrl)}/api/?${params.toString()}`,
		headers: HEADERS,
	});
	const hits: SearchHit[] = [];

	for (const feature of (response.json as PhotonResponse).features ?? []) {
		const p = feature.properties ?? {};
		const type = OSM_TYPES[String(p.osm_type)];
		const point = feature.geometry?.coordinates;

		if (!type || !point || p.osm_id === undefined) {
			continue;
		}

		const street = [p.street, p.housenumber].filter((part) => part !== undefined).join(" ");

		hits.push({
			ref: { type, id: Number(p.osm_id) },
			name: p.name !== undefined ? String(p.name) : street,
			key: String(p.osm_key ?? ""),
			value: String(p.osm_value ?? ""),
			kind: String(p.type ?? ""),
			coordinates: [point[1], point[0]],
			address: [street, p.district, p.city ?? p.county, p.state, p.country]
				.filter((part) => part !== undefined && part !== "" && part !== p.name)
				.join(", "),
		});
	}

	return hits;
}

/** Nominatim's address keys, from the most specific. */
const ADDRESS_LEVELS = [
	"neighbourhood",
	"quarter",
	"suburb",
	"city_district",
	"borough",
	"hamlet",
	"village",
	"town",
	"city",
	"municipality",
	"county",
	"province",
	"state",
	"country",
];

/** Extra tags that say what a place is, as opposed to how to reach it. */
const DESCRIPTIVE_TAGS = [
	"amenity",
	"shop",
	"tourism",
	"leisure",
	"historic",
	"building",
	"castle_type",
	"cuisine",
	"sport",
	"club",
	"healthcare",
	"water",
	"place",
];

interface NominatimPlace {
	osm_type: string;
	osm_id: number;
	lat: string;
	lon: string;
	category: string;
	type: string;
	name?: string;
	address?: Record<string, string>;
	extratags?: Record<string, string> | null;
}

export async function placeDetails(
	serviceUrl: string,
	ref: OsmRef,
	language: string,
): Promise<PlaceDetails | null> {
	const params = new URLSearchParams({
		osm_ids: `${ref.type[0]?.toUpperCase()}${ref.id}`,
		format: "jsonv2",
		addressdetails: "1",
		extratags: "1",
		...(language ? { "accept-language": language } : {}),
	});
	const response = await requestUrl({
		url: `${base(serviceUrl)}/lookup?${params.toString()}`,
		headers: HEADERS,
	});
	const place = (response.json as NominatimPlace[])[0];

	if (!place) {
		return null;
	}

	const extra = place.extratags ?? {};
	const tags: Record<string, string> = { [place.category]: place.type };

	for (const key of DESCRIPTIVE_TAGS) {
		const value = extra[key];

		if (value !== undefined && !(key in tags)) {
			tags[key] = value;
		}
	}

	const address = ADDRESS_LEVELS.flatMap((level) => {
		const name = place.address?.[level];
		return name ? [{ level, name }] : [];
	});

	return {
		ref,
		name: place.name ?? "",
		coordinates: [Number(place.lat), Number(place.lon)],
		tags,
		address,
		website: extra.website ?? extra["contact:website"] ?? null,
	};
}

/** What's at a point, for its address: the way to `localizacion` without a match. */
export async function addressAt(
	serviceUrl: string,
	at: LatLng,
	language: string,
): Promise<{ level: string; name: string }[]> {
	const params = new URLSearchParams({
		lat: String(at[0]),
		lon: String(at[1]),
		format: "jsonv2",
		addressdetails: "1",
		zoom: "18",
		...(language ? { "accept-language": language } : {}),
	});
	const response = await requestUrl({
		url: `${base(serviceUrl)}/reverse?${params.toString()}`,
		headers: HEADERS,
	});
	const address = (response.json as { address?: Record<string, string> }).address ?? {};

	return ADDRESS_LEVELS.flatMap((level) => {
		const name = address[level];
		return name ? [{ level, name }] : [];
	});
}
