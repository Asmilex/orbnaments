import { requestUrl } from "obsidian";

/** Wikimedia asks API clients to name themselves; browsers can't set User-Agent. */
const HEADERS = { "Api-User-Agent": "Orbnaments/1.1 (Obsidian plugin)" };

export interface WikiPage {
	lang: string;
	title: string;
	url: string;
	/** Wikipedia's short description, "Student-led demonstrations in China". */
	description: string;
	/** Title of the same article in the other language, if it has one. */
	translation: string | null;
	disambiguation: boolean;
}

export interface SearchResult {
	title: string;
	snippet: string;
}

interface QueryResponse {
	query?: {
		pages?: {
			title: string;
			missing?: boolean;
			invalid?: boolean;
			fullurl?: string;
			description?: string;
			pageprops?: { disambiguation?: string };
			langlinks?: { lang: string; title: string }[];
		}[];
		search?: { title: string; snippet: string }[];
	};
}

async function query(lang: string, params: Record<string, string>): Promise<QueryResponse> {
	const search = new URLSearchParams({
		action: "query",
		format: "json",
		formatversion: "2",
		...params,
	});
	const response = await requestUrl({
		url: `https://${lang}.wikipedia.org/w/api.php?${search.toString()}`,
		headers: HEADERS,
	});

	return response.json as QueryResponse;
}

/**
 * The article called `title`, following redirects, or null if there's none.
 * `otherLang` is where to look for its translation.
 */
export async function lookupPage(
	lang: string,
	title: string,
	otherLang: string,
): Promise<WikiPage | null> {
	const data = await query(lang, {
		titles: title,
		redirects: "1",
		prop: "info|pageprops|description|langlinks",
		inprop: "url",
		ppprop: "disambiguation",
		...(otherLang ? { lllang: otherLang } : {}),
	});
	const page = data.query?.pages?.[0];

	if (!page || page.missing || page.invalid || !page.fullurl) {
		return null;
	}

	return {
		lang,
		title: page.title,
		url: page.fullurl,
		description: page.description ?? "",
		translation: page.langlinks?.[0]?.title ?? null,
		disambiguation: page.pageprops?.disambiguation !== undefined,
	};
}

export interface ResolvedTitle {
	/** After normalization and redirects. */
	canonical: string;
	translation: string | null;
}

/** Wikimedia's cap on titles per query. */
const TITLES_PER_QUERY = 50;

/**
 * Follows redirects and finds translations for many titles at once, keyed by
 * the title as given. Titles of missing articles are left out.
 */
export async function resolveTitles(
	lang: string,
	titles: string[],
	otherLang: string,
): Promise<Map<string, ResolvedTitle>> {
	const resolved = new Map<string, ResolvedTitle>();

	for (let start = 0; start < titles.length; start += TITLES_PER_QUERY) {
		const chunk = titles.slice(start, start + TITLES_PER_QUERY);
		const data = (await query(lang, {
			titles: chunk.join("|"),
			redirects: "1",
			prop: "langlinks",
			lllimit: "max",
			...(otherLang ? { lllang: otherLang } : {}),
		})) as QueryResponse & {
			query?: {
				normalized?: { from: string; to: string }[];
				redirects?: { from: string; to: string }[];
			};
		};

		const normalized = new Map(data.query?.normalized?.map((n) => [n.from, n.to]));
		const redirects = new Map(data.query?.redirects?.map((r) => [r.from, r.to]));
		const pages = new Map(
			(data.query?.pages ?? [])
				.filter((page) => !page.missing && !page.invalid)
				.map((page) => [page.title, page]),
		);

		for (const title of chunk) {
			const name = normalized.get(title) ?? title;
			const page = pages.get(redirects.get(name) ?? name);

			if (page) {
				resolved.set(title, {
					canonical: page.title,
					translation: page.langlinks?.[0]?.title ?? null,
				});
			}
		}
	}

	return resolved;
}

export async function searchArticles(lang: string, text: string): Promise<SearchResult[]> {
	if (text.trim().length === 0) {
		return [];
	}

	const data = await query(lang, {
		list: "search",
		srsearch: text,
		srlimit: "10",
		srprop: "snippet",
	});

	return (data.query?.search ?? []).map((result) => ({
		title: result.title,
		snippet:
			new DOMParser().parseFromString(result.snippet, "text/html").body
				.textContent ?? "",
	}));
}

export async function fetchArticleHtml(url: string): Promise<string> {
	const response = await requestUrl({ url, headers: HEADERS });

	return response.text;
}
