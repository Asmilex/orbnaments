import { App, SuggestModal, TFile, setIcon } from "obsidian";
import { LatLng, SearchHit, searchPlaces } from "../commands/places/api";
import type { PlaceTypes } from "../commands/places/place-types";

const TYPING_PAUSE_MS = 300;

/** A result this close to the note's coordinates may well be the place. */
const NEARBY_METRES = 1000;

/** Leave the place unmatched and only use the note's own coordinates. */
export const COORDINATES_ONLY = "coordinates-only";

export type PlaceChoice = SearchHit | typeof COORDINATES_ONLY;

export interface PlaceSearch {
	serviceUrl: string;
	language: string;
	initial: string;
	/** Where to search around, and to measure distances from. */
	near: LatLng | null;
	/** The note's qualifier as a place type: matching results go first. */
	wanted: TFile | null;
	types: PlaceTypes;
	/** Offer to skip the match when the note already knows where it is. */
	hasCoordinates: boolean;
}

/** Metres between two points. */
export function distance(a: LatLng, b: LatLng): number {
	const rad = Math.PI / 180;
	const h =
		Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
		Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;

	return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function describeDistance(metres: number): string {
	return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

/** Searches OpenStreetMap as you type; resolves with the chosen place, or null. */
class PlaceSearchModal extends SuggestModal<PlaceChoice> {
	private chosen = false;
	private latest = 0;

	constructor(
		app: App,
		private readonly search: PlaceSearch,
		private readonly done: (choice: PlaceChoice | null) => void,
	) {
		super(app);
		this.modalEl.addClass("orbnaments-place-search");
		this.setPlaceholder("Search OpenStreetMap");
		this.emptyStateText = "No places found";
	}

	onOpen() {
		void super.onOpen();
		this.inputEl.value = this.search.initial;
		this.inputEl.dispatchEvent(new Event("input"));
	}

	async getSuggestions(text: string): Promise<PlaceChoice[]> {
		const ticket = ++this.latest;

		await new Promise((resolve) => window.setTimeout(resolve, TYPING_PAUSE_MS));

		if (ticket !== this.latest) {
			return [];
		}

		let hits: SearchHit[] = [];

		try {
			hits = await searchPlaces(this.search.serviceUrl, text, this.search.near, this.search.language);
		} catch (error) {
			console.error("Place search failed", error);
		}

		const { wanted, types, near, hasCoordinates } = this.search;
		const metres = (hit: SearchHit) => (near ? distance(near, hit.coordinates) : 0);

		// The note's own coordinates say where the place is, so nearest first.
		if (hasCoordinates && near) {
			hits = [...hits].sort((a, b) => metres(a) - metres(b));
		}

		if (wanted) {
			const fits = (hit: SearchHit) => {
				const type = types.classify({ [hit.key]: hit.value }, hit.kind);
				return type !== null && types.isA(type, wanted);
			};

			hits = [...hits.filter(fits), ...hits.filter((hit) => !fits(hit))];
		}

		if (!hasCoordinates) {
			return hits;
		}

		// Nothing near the note: OSM probably doesn't have it.
		const nearby = hits.some((hit) => metres(hit) <= NEARBY_METRES);

		return nearby ? [...hits, COORDINATES_ONLY] : [COORDINATES_ONLY, ...hits];
	}

	renderSuggestion(choice: PlaceChoice, el: HTMLElement) {
		el.addClass("mod-complex");

		const icon = el.createDiv({ cls: "suggestion-icon" });
		const content = el.createDiv({ cls: "suggestion-content" });

		if (choice === COORDINATES_ONLY) {
			setIcon(icon, "map-pin");
			content.createDiv({ cls: "suggestion-title", text: "None of these" });
			content.createDiv({
				cls: "suggestion-note",
				text: "Keep the note's coordinates and only fill in where it is",
			});
			return;
		}

		const type = this.search.types.classify({ [choice.key]: choice.value }, choice.kind);
		const near = this.search.near;
		const details = [
			type?.basename ?? `${choice.key}=${choice.value}`,
			choice.address,
			near ? describeDistance(distance(near, choice.coordinates)) : "",
		].filter((part) => part.length > 0);

		setIcon(icon, this.search.types.icon(type) ?? "map-pin");
		content.createDiv({ cls: "suggestion-title", text: choice.name || "(unnamed)" });
		content.createDiv({ cls: "suggestion-note", text: details.join(" · ") });
	}

	onChooseSuggestion(choice: PlaceChoice) {
		this.chosen = true;
		this.done(choice);
	}

	onClose() {
		super.onClose();
		// Obsidian closes the modal before reporting the choice.
		window.setTimeout(() => {
			if (!this.chosen) {
				this.done(null);
			}
		}, 0);
	}
}

export function pickPlace(app: App, search: PlaceSearch): Promise<PlaceChoice | null> {
	return new Promise((resolve) => {
		new PlaceSearchModal(app, search, resolve).open();
	});
}
