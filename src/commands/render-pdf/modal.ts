import { App, Modal, Setting } from "obsidian";
import { PAPER_SIZES } from "./types";
import type { RenderPdfOptions, WikilinkMode } from "./types";

const WIKILINK_LABELS: Record<WikilinkMode, string> = {
	text: "Plain text",
	link: "Keep as links",
	keep: "Leave the brackets",
};

/**
 * Asks for the handful of choices that can't be guessed from the note itself.
 * Everything derivable — title, authors, abstract, date — arrives pre-filled
 * from the frontmatter and can still be overridden here.
 */
export class RenderPdfModal extends Modal {
	private readonly options: RenderPdfOptions;
	private readonly onSubmit: (options: RenderPdfOptions) => void;

	constructor(
		app: App,
		options: RenderPdfOptions,
		onSubmit: (options: RenderPdfOptions) => void,
	) {
		super(app);
		this.options = structuredClone(options);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		const { document: doc, layout, content, output } = this.options;

		this.setTitle("Render to PDF");
		contentEl.addClass("orbnaments-render-pdf");

		new Setting(contentEl).setName("Document").setHeading();

		new Setting(contentEl).setName("Title").addText((text) =>
			text.setValue(doc.title).onChange((value) => {
				doc.title = value;
			}),
		);

		new Setting(contentEl)
			.setName("Authors")
			.setDesc("Separated by commas.")
			.addText((text) =>
				text
					.setPlaceholder("Someone, someone else")
					.setValue(doc.authors.join(", "))
					.onChange((value) => {
						doc.authors = value
							.split(",")
							.map((author) => author.trim())
							.filter((author) => author.length > 0);
					}),
			);

		new Setting(contentEl)
			.setName("Abstract")
			.addTextArea((area) =>
				area.setValue(doc.abstract).onChange((value) => {
					doc.abstract = value;
				}),
			);

		new Setting(contentEl)
			.setName("Date")
			.setDesc("Leave empty to omit it.")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.setValue(doc.date)
					.onChange((value) => {
						doc.date = value.trim();
					}),
			);

		new Setting(contentEl)
			.setName("Language")
			.addText((text) =>
				text
					.setValue(doc.language)
					.onChange((value) => {
						doc.language = value.trim();
					}),
			);

		if (doc.sourceLink.length > 0) {
			const link = doc.sourceLink;

			new Setting(contentEl)
				.setName("Cite the original")
				.setDesc(`Adds a line pointing at ${link}.`)
				.addToggle((toggle) =>
					toggle.setValue(true).onChange((value) => {
						doc.sourceLink = value ? link : "";
					}),
				);
		}

		new Setting(contentEl).setName("Layout").setHeading();

		new Setting(contentEl)
			.setName("Cover page")
			.addToggle((toggle) =>
				toggle.setValue(layout.coverPage).onChange((value) => {
					layout.coverPage = value;
				}),
			);

		new Setting(contentEl)
			.setName("Table of contents")
			.addToggle((toggle) =>
				toggle.setValue(layout.tableOfContents).onChange((value) => {
					layout.tableOfContents = value;
				}),
			);

		new Setting(contentEl).setName("Figure index").addToggle((toggle) =>
			toggle.setValue(layout.figureIndex).onChange((value) => {
				layout.figureIndex = value;
			}),
		);

		new Setting(contentEl).setName("Table index").addToggle((toggle) =>
			toggle.setValue(layout.tableIndex).onChange((value) => {
				layout.tableIndex = value;
			}),
		);

		new Setting(contentEl).setName("Listing index").addToggle((toggle) =>
			toggle.setValue(layout.listingIndex).onChange((value) => {
				layout.listingIndex = value;
			}),
		);

		new Setting(contentEl)
			.setName("Start each section on a new page")
			.addToggle((toggle) =>
				toggle.setValue(layout.chapterPagebreak).onChange((value) => {
					layout.chapterPagebreak = value;
				}),
			);

		new Setting(contentEl).setName("Paper size").addDropdown((dropdown) => {
			for (const size of PAPER_SIZES) {
				dropdown.addOption(size, size);
			}

			dropdown.setValue(layout.paperSize).onChange((value) => {
				layout.paperSize = value;
			});
		});

		new Setting(contentEl).setName("Obsidian syntax").setHeading();

		new Setting(contentEl)
			.setName("Wikilinks")
			.setDesc("How [[links]] are rendered.")
			.addDropdown((dropdown) => {
				for (const [mode, label] of Object.entries(WIKILINK_LABELS)) {
					dropdown.addOption(mode, label);
				}

				dropdown.setValue(content.wikilinks).onChange((value) => {
					content.wikilinks = value as WikilinkMode;
				});
			});

		new Setting(contentEl)
			.setName("Expand embedded notes")
			.setDesc("Inline the contents of ![[embeds]] instead of naming them.")
			.addToggle((toggle) =>
				toggle
					.setValue(content.expandEmbeddedNotes)
					.onChange((value) => {
						content.expandEmbeddedNotes = value;
					}),
			);

		new Setting(contentEl).setName("Output").setHeading();

		new Setting(contentEl)
			.setName("Destination folder")
			.setDesc("Outside the vault; nothing is written inside it.")
			.addText((text) =>
				text
					.setPlaceholder("~/Desktop")
					.setValue(output.folder)
					.onChange((value) => {
						output.folder = value;
					}),
			);

		new Setting(contentEl)
			.setName("Open when done")
			.addToggle((toggle) =>
				toggle.setValue(output.openWhenDone).onChange((value) => {
					output.openWhenDone = value;
				}),
			);

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText("Render")
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.options);
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
