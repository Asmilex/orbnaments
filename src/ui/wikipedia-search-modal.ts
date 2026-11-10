import { App, SuggestModal } from "obsidian";
import { SearchResult, searchArticles } from "../commands/wikipedia/api";

const TYPING_PAUSE_MS = 300;

/** Searches Wikipedia as you type; resolves with the chosen title, or null. */
class WikipediaSearchModal extends SuggestModal<SearchResult> {
	private chosen = false;
	private latest = 0;

	constructor(
		app: App,
		private readonly lang: string,
		private readonly initial: string,
		private readonly done: (title: string | null) => void,
	) {
		super(app);
		this.setPlaceholder(`Search ${lang}.wikipedia.org`);
		this.emptyStateText = "No articles found";
	}

	onOpen() {
		void super.onOpen();
		this.inputEl.value = this.initial;
		this.inputEl.dispatchEvent(new Event("input"));
	}

	async getSuggestions(text: string): Promise<SearchResult[]> {
		const ticket = ++this.latest;

		await new Promise((resolve) => window.setTimeout(resolve, TYPING_PAUSE_MS));

		if (ticket !== this.latest) {
			return [];
		}

		try {
			return await searchArticles(this.lang, text);
		} catch (error) {
			console.error("Wikipedia search failed", error);
			return [];
		}
	}

	renderSuggestion(result: SearchResult, el: HTMLElement) {
		el.createEl("div", { text: result.title });
		el.createEl("small", { text: result.snippet, cls: "mod-muted" });
	}

	onChooseSuggestion(result: SearchResult) {
		this.chosen = true;
		this.done(result.title);
	}

	onClose() {
		super.onClose();
		// Obsidian closes the modal before reporting the choice.
		window.setTimeout(() => {
			if (!this.chosen) {
				this.done(null);
			}
		}, 0);
	}
}

export function pickArticle(app: App, lang: string, initial: string): Promise<string | null> {
	return new Promise((resolve) => {
		new WikipediaSearchModal(app, lang, initial, resolve).open();
	});
}
