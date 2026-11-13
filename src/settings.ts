import type { WikilinkMode } from "./commands/render-pdf/types";

export interface OrbnamentsSettings {
	steamGridDbApiKey: string;

	/** Empty means "find it on the PATH". */
	pdfPandocPath: string;
	pdfTypstPath: string;
	pdfOutputFolder: string;
	pdfOpenWhenDone: boolean;
	pdfLanguage: string;
	pdfPaperSize: string;
	pdfCoverPage: boolean;
	pdfTableOfContents: boolean;
	pdfFigureIndex: boolean;
	pdfTableIndex: boolean;
	pdfListingIndex: boolean;
	pdfChapterPagebreak: boolean;
	pdfWikilinks: WikilinkMode;
	pdfExpandEmbeddedNotes: boolean;

	/** Wiki the articles come from, `en` for en.wikipedia.org. */
	wikipediaLanguage: string;
	/** Second wiki, for aliases and for note titles written in it. Empty disables it. */
	wikipediaAliasLanguage: string;
	/** Where filled notes move to. Empty leaves them where they are. */
	wikipediaFolder: string;
	/** Notes here count as categories, besides those filed under `[[categories]]`. */
	wikipediaCategoryFolder: string;

	/** Photon, for searching OpenStreetMap. */
	placesSearchUrl: string;
	/** Nominatim, for a place's tags and address. */
	placesDetailsUrl: string;
	/** Language for names in addresses, `es`. */
	placesLanguage: string;
	/** The category every place type descends from. */
	placesCategory: string;
	/** Where new place notes move to. Empty leaves them where they are. */
	placesFolder: string;
}

export const DEFAULT_SETTINGS: OrbnamentsSettings = {
	steamGridDbApiKey: "",

	pdfPandocPath: "",
	pdfTypstPath: "",
	pdfOutputFolder: "~/Desktop",
	pdfOpenWhenDone: true,
	pdfLanguage: "en",
	pdfPaperSize: "a4",
	pdfCoverPage: true,
	pdfTableOfContents: false,
	pdfFigureIndex: false,
	pdfTableIndex: false,
	pdfListingIndex: false,
	pdfChapterPagebreak: false,
	pdfWikilinks: "text",
	pdfExpandEmbeddedNotes: true,

	wikipediaLanguage: "en",
	wikipediaAliasLanguage: "es",
	wikipediaFolder: "Clippings",
	wikipediaCategoryFolder: "Categorías",

	placesSearchUrl: "https://photon.komoot.io",
	placesDetailsUrl: "https://nominatim.openstreetmap.org",
	placesLanguage: "es",
	placesCategory: "lugares",
	placesFolder: "Lugares",
};
