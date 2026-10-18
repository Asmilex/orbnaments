import { Notice, Platform, TFile } from "obsidian";
import type OrbnamentsPlugin from "../../main";
import { documentOptionsFromNote } from "./frontmatter";
import { RenderPdfModal } from "./modal";
import { openExternally } from "./node";
import { renderNoteToPdf } from "./render";
import type { RenderPdfOptions } from "./types";

/** Builds the starting point for the modal: note metadata plus sticky settings. */
function initialOptions(
	plugin: OrbnamentsPlugin,
	file: TFile,
): RenderPdfOptions {
	const settings = plugin.settings;

	return {
		document: documentOptionsFromNote(
			plugin.app,
			file,
			settings.pdfLanguage,
		),
		layout: {
			coverPage: settings.pdfCoverPage,
			tableOfContents: settings.pdfTableOfContents,
			figureIndex: settings.pdfFigureIndex,
			tableIndex: settings.pdfTableIndex,
			listingIndex: settings.pdfListingIndex,
			chapterPagebreak: settings.pdfChapterPagebreak,
			paperSize: settings.pdfPaperSize,
		},
		content: {
			wikilinks: settings.pdfWikilinks,
			expandEmbeddedNotes: settings.pdfExpandEmbeddedNotes,
		},
		output: {
			folder: settings.pdfOutputFolder,
			openWhenDone: settings.pdfOpenWhenDone,
		},
	};
}

/** Remembers the choices that aren't note-specific, so the next run starts there. */
async function rememberChoices(
	plugin: OrbnamentsPlugin,
	options: RenderPdfOptions,
): Promise<void> {
	plugin.settings.pdfLanguage = options.document.language;
	plugin.settings.pdfCoverPage = options.layout.coverPage;
	plugin.settings.pdfTableOfContents = options.layout.tableOfContents;
	plugin.settings.pdfFigureIndex = options.layout.figureIndex;
	plugin.settings.pdfTableIndex = options.layout.tableIndex;
	plugin.settings.pdfListingIndex = options.layout.listingIndex;
	plugin.settings.pdfChapterPagebreak = options.layout.chapterPagebreak;
	plugin.settings.pdfPaperSize = options.layout.paperSize;
	plugin.settings.pdfWikilinks = options.content.wikilinks;
	plugin.settings.pdfExpandEmbeddedNotes = options.content.expandEmbeddedNotes;
	plugin.settings.pdfOutputFolder = options.output.folder;
	plugin.settings.pdfOpenWhenDone = options.output.openWhenDone;

	await plugin.saveSettings();
}

async function render(
	plugin: OrbnamentsPlugin,
	file: TFile,
	options: RenderPdfOptions,
): Promise<void> {
	await rememberChoices(plugin, options);

	const progress = new Notice("Rendering to PDF…", 0);

	try {
		const { pdfPath, warnings } = await renderNoteToPdf(
			plugin.app,
			plugin.settings,
			file,
			options,
			(message) => progress.setMessage(message),
		);

		progress.hide();

		if (warnings.length > 0) {
			console.warn("Orbnaments: PDF render warnings", warnings);
			new Notice(
				`Rendered with ${warnings.length} warning(s):\n· ${warnings
					.slice(0, 3)
					.join("\n· ")}`,
				10000,
			);
		}

		new Notice(`Rendered ${file.basename}.pdf`);

		if (options.output.openWhenDone) {
			await openExternally(pdfPath);
		}
	} catch (error) {
		progress.hide();
		console.error("Orbnaments: could not render the PDF", error);
		new Notice(
			error instanceof Error
				? error.message
				: "Could not render the PDF.",
			15000,
		);
	}
}

/** Entry point for the "Render to PDF using ilm-prima" command. */
export function renderToPdf(plugin: OrbnamentsPlugin): void {
	if (!Platform.isDesktopApp) {
		new Notice(
			"Rendering to PDF needs the desktop app, which shells out to Pandoc and Typst.",
		);
		return;
	}

	const file = plugin.app.workspace.getActiveFile();

	if (!file || file.extension !== "md") {
		new Notice("Open a markdown note first");
		return;
	}

	new RenderPdfModal(plugin.app, initialOptions(plugin, file), (options) => {
		void render(plugin, file, options);
	}).open();
}
