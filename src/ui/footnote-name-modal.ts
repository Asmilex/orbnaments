import { App, Modal, Setting } from "obsidian";

interface FootnoteNameModalOptions {
	title: string;
	/** Text of the confirmation button. */
	ctaText: string;
	placeholder?: string;
	/** Value the text field starts with, already selected so it can be typed over. */
	initialValue?: string;
	onSubmit: (name: string) => void;
}

/**
 * Asks the user for a footnote name. Shared by the commands that create and rename footnotes.
 */
export class FootnoteNameModal extends Modal {
	private options: FootnoteNameModalOptions;
	private resultName: string;

	constructor(app: App, options: FootnoteNameModalOptions) {
		super(app);
		this.options = options;
		this.resultName = options.initialValue ?? "";
	}

	onOpen() {
		const { contentEl } = this;

		this.setTitle(this.options.title);

		new Setting(contentEl).setName("Footnote name").addText((text) => {
			if (this.options.placeholder) {
				text.setPlaceholder(this.options.placeholder);
			}

			text.setValue(this.resultName);
			text.onChange((value) => {
				this.resultName = value;
			});
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key !== "Enter" || e.isComposing) {
					return;
				}

				// Without this, Enter keeps travelling and gets typed into the
				// editor we hand focus back to in onSubmit.
				e.preventDefault();
				e.stopPropagation();

				this.submit();
			});
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText(this.options.ctaText)
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	private submit() {
		this.close();
		this.options.onSubmit(this.resultName);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
