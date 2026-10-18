import type { TFile } from "obsidian";

/** How `[[wikilinks]]` survive the trip to a PDF. */
export type WikilinkMode = "text" | "link" | "keep";

/** Metadata that ends up in the `ilm.with(...)` header. */
export interface PdfDocumentOptions {
	title: string;
	authors: string[];
	abstract: string;
	/** `YYYY-MM-DD`; empty means "no date". */
	date: string;
	language: string;
	/** URL cited under the abstract; empty means "don't cite anything". */
	sourceLink: string;
}

/** Everything ilm-prima lets us toggle about the shape of the document. */
export interface PdfLayoutOptions {
	coverPage: boolean;
	tableOfContents: boolean;
	figureIndex: boolean;
	tableIndex: boolean;
	listingIndex: boolean;
	chapterPagebreak: boolean;
	paperSize: string;
}

/** How the Obsidian-specific syntax is translated. */
export interface PdfContentOptions {
	wikilinks: WikilinkMode;
	expandEmbeddedNotes: boolean;
}

export interface PdfOutputOptions {
	/** Absolute path (or `~`-relative) of the folder the PDF lands in. */
	folder: string;
	openWhenDone: boolean;
}

export interface RenderPdfOptions {
	document: PdfDocumentOptions;
	layout: PdfLayoutOptions;
	content: PdfContentOptions;
	output: PdfOutputOptions;
}

/** A file the Typst build needs next to it, resolved but not yet copied. */
export interface AssetRequest {
	/** Name inside the build's `assets/` folder, always safe to quote. */
	fileName: string;
	/** Set when the asset comes from the vault. */
	file?: TFile;
	/** Set when the asset has to be downloaded. */
	url?: string;
}

export class PdfRenderError extends Error {
	readonly type = "pdf-render-error";
	cause?: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "PdfRenderError";
		this.cause = cause;
	}
}

export const PAPER_SIZES = ["a4", "a5", "us-letter", "us-legal"] as const;
