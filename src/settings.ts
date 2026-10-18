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
};
