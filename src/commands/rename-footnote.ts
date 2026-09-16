import { App, Editor, Notice } from "obsidian";
import { FootnoteNameModal } from "../ui/footnote-name-modal";
import {
	FOOTNOTE_MARKER,
	escapeForRegExp,
	isLabelTaken,
	sanitizeLabel,
} from "./footnote-labels";

/**
 * Label of the footnote the cursor sits on, either its reference or its definition.
 * Returns null when the cursor is not touching a footnote marker.
 */
function findLabelAtCursor(editor: Editor): string | null {
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);

	// A fresh regex per call: FOOTNOTE_MARKER is global, so it carries lastIndex around.
	const markers = new RegExp(FOOTNOTE_MARKER.source, "g");
	let match: RegExpExecArray | null;

	while ((match = markers.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;

		// `end` is inclusive so that a cursor resting right after the `]` still counts.
		if (cursor.ch >= start && cursor.ch <= end) {
			return match[1] ?? null;
		}
	}

	return null;
}

/**
 * Rewrite every `[^oldLabel]` in the document, which covers both the references
 * and the definition. Only the lines that change are touched, so the rest of the
 * document keeps its state.
 */
function replaceLabel(editor: Editor, oldLabel: string, newLabel: string): void {
	const marker = new RegExp(`\\[\\^${escapeForRegExp(oldLabel)}\\]`, "g");
	const replacement = `[^${newLabel}]`;

	for (let line = 0; line <= editor.lastLine(); line++) {
		const text = editor.getLine(line);
		const updated = text.replace(marker, replacement);

		if (updated !== text) {
			editor.setLine(line, updated);
		}
	}
}

export function renameFootnote(app: App, editor: Editor): void {
	const oldLabel = findLabelAtCursor(editor);

	if (!oldLabel) {
		new Notice("No footnote under cursor.");
		return;
	}

	new FootnoteNameModal(app, {
		title: "Rename footnote",
		ctaText: "Rename",
		initialValue: oldLabel,
		onSubmit: (name) => {
			const newLabel = sanitizeLabel(name);

			if (!newLabel) {
				new Notice("The footnote name cannot be empty");
				return;
			}

			if (newLabel === oldLabel) {
				return;
			}

			if (isLabelTaken(editor.getValue(), newLabel)) {
				new Notice(`The footnote [^${newLabel}] already exists`);
				return;
			}

			replaceLabel(editor, oldLabel, newLabel);
			editor.focus();
		},
	}).open();
}
