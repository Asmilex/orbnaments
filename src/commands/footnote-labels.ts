/**
 * Helpers shared by the footnote commands.
 */

/** Matches a footnote marker, `[^label]`, capturing the label. */
export const FOOTNOTE_MARKER = /\[\^([^\]\s]+)\]/g;

/**
 * Turn a user-provided name into a valid footnote label.
 * Footnote labels cannot contain whitespace or the characters used by the syntax itself.
 */
export function sanitizeLabel(name: string): string {
	return name
		.trim()
		.replace(/[[\]^]/g, "")
		.replace(/\s+/g, "-");
}

export function escapeForRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isLabelTaken(content: string, label: string): boolean {
	return new RegExp(`\\[\\^${escapeForRegExp(label)}\\]`).test(content);
}

/**
 * Find a label that is not already used as a footnote in the document.
 */
export function getUniqueLabel(content: string, baseLabel: string): string {
	let index = 1;

	while (true) {
		const candidate = index === 1 ? baseLabel : `${baseLabel}-${index}`;

		if (!isLabelTaken(content, candidate)) {
			return candidate;
		}

		index++;
	}
}
