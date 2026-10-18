import type { PdfDocumentOptions, PdfLayoutOptions } from "./types";

/** Path of an optional per-vault override for the header below. */
export const PREAMBLE_OVERRIDE_PATH = ".pandoc/preamble.typ";

/**
 * The `ilm.with(...)` header. `{{placeholders}}` are filled in from the export
 * options; the names match the ones the `.pandoc/md2pdf` script used, so an
 * existing `.pandoc/preamble.typ` can be dropped in as an override unchanged.
 */
export const DEFAULT_PREAMBLE = `#import "@local/ilm-prima:1.0.0": *

#set text(lang: "{{lang}}")

#show: ilm.with(
  title: [{{title}}],
  authors: {{authors}},
  date: {{date}},
  abstract: {{abstract}},
  cover-page: {{cover}},
  paper-size: "{{paper}}",
  chapter-pagebreak: {{chapter_pagebreak}},
  table-of-contents: {{toc}},
  figure-index: (enabled: {{figure_index}}),
  table-index: (enabled: {{table_index}}),
  listing-index: (enabled: {{listing_index}}),
)
`;

/**
 * Appended after the preamble (so it survives a user-supplied override) and used
 * by the raw blocks the preprocessor emits for Obsidian callouts.
 */
export const CALLOUT_PRELUDE = `#let orb-callout(kind, title, body) = {
  let palette = (
    note: rgb("#086ddd"), info: rgb("#086ddd"), todo: rgb("#086ddd"),
    abstract: rgb("#00bfbc"), summary: rgb("#00bfbc"), tldr: rgb("#00bfbc"),
    tip: rgb("#00bfbc"), hint: rgb("#00bfbc"), important: rgb("#00bfbc"),
    success: rgb("#08b94e"), check: rgb("#08b94e"), done: rgb("#08b94e"),
    question: rgb("#ec7500"), help: rgb("#ec7500"), faq: rgb("#ec7500"),
    warning: rgb("#ec7500"), caution: rgb("#ec7500"), attention: rgb("#ec7500"),
    failure: rgb("#e93147"), fail: rgb("#e93147"), missing: rgb("#e93147"),
    danger: rgb("#e93147"), error: rgb("#e93147"), bug: rgb("#e93147"),
    example: rgb("#7852ee"),
    quote: rgb("#9e9e9e"), cite: rgb("#9e9e9e"),
  )
  let accent = palette.at(kind, default: rgb("#086ddd"))

  block(
    width: 100%,
    breakable: true,
    fill: accent.lighten(92%),
    stroke: (left: 2.5pt + accent),
    inset: (x: 1em, y: 0.75em),
    radius: (top-right: 3pt, bottom-right: 3pt),
  )[
    #text(fill: accent.darken(25%), weight: "bold")[#title]

    #body
  ]
}
`;

/** Escapes a string destined for a Typst string literal. */
export function typstString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Escapes plain text destined for a Typst `[content]` block. */
export function typstContent(value: string): string {
	return value.replace(/[\\#$@<>*_`~[\]]/g, (char) => `\\${char}`);
}

function authorsValue(authors: string[]): string {
	if (authors.length === 0) {
		return typstString("");
	}

	if (authors.length === 1) {
		return typstString(authors[0] ?? "");
	}

	return `(${authors.map(typstString).join(", ")})`;
}

function dateValue(date: string): string {
	const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());

	if (!parts) {
		return "none";
	}

	return `datetime(year: ${Number(parts[1])}, month: ${Number(
		parts[2],
	)}, day: ${Number(parts[3])})`;
}

function abstractValue(abstract: string, sourceLink: string): string {
	const parts: string[] = [];

	if (abstract.trim().length > 0) {
		parts.push(typstContent(abstract.trim()));
	}

	if (sourceLink.trim().length > 0) {
		const host = sourceLink
			.trim()
			.replace(/^https?:\/\/(www\.)?/, "")
			.split("/")[0];
		const lead = parts.length > 0 ? "#v(0.5em)\n    " : "";

		parts.push(
			`${lead}Originally published at #link(${typstString(
				sourceLink.trim(),
			)})[${typstContent(host ?? sourceLink.trim())}].`,
		);
	}

	if (parts.length === 0) {
		return "none";
	}

	return `[\n    ${parts.join("\n\n    ")}\n  ]`;
}

/** Substitutes the `{{placeholders}}` in a preamble template. */
export function fillPreamble(
	template: string,
	document: PdfDocumentOptions,
	layout: PdfLayoutOptions,
): string {
	const fields: Record<string, string> = {
		lang: document.language || "en",
		title: typstContent(document.title),
		authors: authorsValue(document.authors),
		date: dateValue(document.date),
		abstract: abstractValue(document.abstract, document.sourceLink),
		cover: layout.coverPage ? '"use-ilm-default"' : "none",
		paper: layout.paperSize,
		chapter_pagebreak: String(layout.chapterPagebreak),
		toc: layout.tableOfContents ? "outline()" : "none",
		figure_index: String(layout.figureIndex),
		table_index: String(layout.tableIndex),
		listing_index: String(layout.listingIndex),
	};

	return Object.entries(fields).reduce(
		(filled, [key, value]) => filled.split(`{{${key}}}`).join(value),
		template,
	);
}
