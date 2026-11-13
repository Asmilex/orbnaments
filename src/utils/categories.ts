import { asStrings, stripWikilink } from "./obsidian-markdown";

/** `category-theory`, `Category theory` and `Category_theory` all read the same. */
export function categoryKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[\s_-]+/g, " ")
		.trim();
}

/** Linktext targets of a frontmatter list, `"[[mathematics]]"` -> `mathematics`. */
export function linkedNames(value: unknown): string[] {
	return asStrings(value).map((entry) => stripWikilink(entry.replace(/\|.*\]\]$/, "]]")));
}
