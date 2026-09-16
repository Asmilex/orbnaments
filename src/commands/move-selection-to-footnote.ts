import { App, Editor, EditorPosition, Notice } from "obsidian";
import { FootnoteNameModal } from "../ui/footnote-name-modal";
import { getUniqueLabel, isLabelTaken, sanitizeLabel } from "./footnote-labels";

const DEFAULT_LABEL_PREFIX = "footnote";

/**
 * Label used when the user does not name the footnote: footnote-1, footnote-2, ...
 */
function getDefaultLabel(content: string): string {
	let index = 1;

	while (isLabelTaken(content, `${DEFAULT_LABEL_PREFIX}-${index}`)) {
		index++;
	}

	return `${DEFAULT_LABEL_PREFIX}-${index}`;
}

/**
 * Collapse a (possibly multiline) selection into a single line, since a footnote
 * definition lives on one line.
 */
function toSingleLine(selection: string): string {
	return selection
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join(" ");
}

/**
 * Index of the last line of the paragraph containing `fromLine`.
 */
function findParagraphEnd(editor: Editor, fromLine: number): number {
	const lastLine = editor.lastLine();

	for (let line = fromLine; line <= lastLine; line++) {
		if (editor.getLine(line).trim().length === 0) {
			return line === fromLine ? line : line - 1;
		}
	}

	return lastLine;
}

export function moveSelectionToFootnote(app: App, editor: Editor): void {
	const selection = editor.getSelection();

	if (selection.trim().length === 0) {
		new Notice("Select some text first");
		return;
	}

	// Capture the selection bounds now: they are no longer reliable once the modal steals focus.
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");

	new FootnoteNameModal(app, {
		title: "Move selection to footnote",
		ctaText: "Create",
		placeholder: "Alpha",
		onSubmit: (name) => {
			const content = editor.getValue();
			const requestedLabel = sanitizeLabel(name);
			const label = requestedLabel
				? getUniqueLabel(content, requestedLabel)
				: getDefaultLabel(content);
			const definition = `[^${label}]: ${toSingleLine(selection)}`;

			// Insert the definition first: it sits after the selection, so doing it the
			// other way around would shift the line we computed here.
			insertBelowParagraph(editor, to.line, definition);

			const reference = `[^${label}]`;
			editor.replaceRange(reference, from, to);

			const cursor: EditorPosition = {
				line: from.line,
				ch: from.ch + reference.length,
			};
			editor.setCursor(cursor);
			editor.focus();
		},
	}).open();
}

function insertBelowParagraph(
	editor: Editor,
	selectionEndLine: number,
	definition: string,
): void {
	const paragraphEnd = findParagraphEnd(editor, selectionEndLine);

	if (paragraphEnd >= editor.lastLine()) {
		const line = editor.lastLine();
		editor.replaceRange(`\n\n${definition}`, {
			line,
			ch: editor.getLine(line).length,
		});
		return;
	}

	editor.replaceRange(`\n${definition}\n`, {
		line: paragraphEnd + 1,
		ch: 0,
	});
}
