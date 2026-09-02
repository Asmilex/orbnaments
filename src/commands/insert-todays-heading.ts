import { Editor, moment } from "obsidian";

export function insertTodaysHeading(editor: Editor): void {
	const today = moment().format("YYYY-MM-DD");
	editor.replaceSelection(`# ${today}\n\n`);
}
