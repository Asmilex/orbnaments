import { App, TFile, normalizePath, requestUrl } from "obsidian";
import {
	bodyWithoutFrontmatter,
	minHeadingLevel,
} from "../../utils/obsidian-markdown";
import { Preprocessor } from "./preprocess";
import {
	expandHome,
	nodeFs,
	nodePath,
	nodeOs,
	resolveBinary,
	run,
} from "./node";
import {
	CALLOUT_PRELUDE,
	DEFAULT_PREAMBLE,
	PREAMBLE_OVERRIDE_PATH,
	fillPreamble,
} from "./typst";
import { PdfRenderError } from "./types";
import type { AssetRequest, RenderPdfOptions } from "./types";
import type { OrbnamentsSettings } from "../../settings";

/**
 * Pandoc's `markdown` already covers footnotes, `$math$`, pipe tables and
 * strikeout; `mark` adds Obsidian's `==highlight==`.
 */
const PANDOC_FROM = "markdown+mark";

export interface RenderReport {
	pdfPath: string;
	warnings: string[];
}

/** Rough count of math spans, used only to notice a silent loss in translation. */
function countMath(text: string): number {
	const display = text.match(/\$\$[\s\S]+?\$\$/g)?.length ?? 0;
	const inline = text.match(/(?<!\$)\$[^$\n]+\$(?!\$)/g)?.length ?? 0;

	return display + inline;
}

async function readPreambleTemplate(app: App): Promise<string> {
	const override = normalizePath(PREAMBLE_OVERRIDE_PATH);

	try {
		if (await app.vault.adapter.exists(override)) {
			return await app.vault.adapter.read(override);
		}
	} catch (error) {
		console.warn(
			`Orbnaments: could not read ${override}, using the built-in preamble.`,
			error,
		);
	}

	return DEFAULT_PREAMBLE;
}

async function writeAssets(
	app: App,
	assets: AssetRequest[],
	assetsDir: string,
	warnings: string[],
): Promise<void> {
	if (assets.length === 0) {
		return;
	}

	const fs = nodeFs();
	const path = nodePath();

	await fs.promises.mkdir(assetsDir, { recursive: true });

	for (const asset of assets) {
		const target = path.join(assetsDir, asset.fileName);

		try {
			if (asset.file) {
				const data = await app.vault.readBinary(asset.file);
				await fs.promises.writeFile(target, new Uint8Array(data));
				continue;
			}

			if (asset.url) {
				const response = await requestUrl({ url: asset.url });
				await fs.promises.writeFile(
					target,
					new Uint8Array(response.arrayBuffer),
				);
			}
		} catch (error) {
			warnings.push(
				`Could not include ${asset.file?.path ?? asset.url}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}

/** Picks a free `<name>.pdf` in the destination folder. */
async function uniquePdfPath(folder: string, basename: string): Promise<string> {
	const fs = nodeFs();
	const path = nodePath();

	for (let index = 0; ; index++) {
		const name = index === 0 ? basename : `${basename} ${index + 1}`;
		const candidate = path.join(folder, `${name}.pdf`);

		try {
			await fs.promises.access(candidate);
		} catch {
			return candidate;
		}
	}
}

/**
 * markdown -> pandoc -> Typst (ilm-prima) -> PDF.
 *
 * Everything happens in a temp directory that is removed afterwards; the only
 * thing that survives is the PDF in the destination folder.
 */
export async function renderNoteToPdf(
	app: App,
	settings: OrbnamentsSettings,
	file: TFile,
	options: RenderPdfOptions,
	onProgress: (message: string) => void,
): Promise<RenderReport> {
	const fs = nodeFs();
	const path = nodePath();

	const pandoc = resolveBinary("pandoc", settings.pdfPandocPath);
	const typst = resolveBinary("typst", settings.pdfTypstPath);

	onProgress("Reading the note…");

	const raw = await app.vault.cachedRead(file);
	const body = bodyWithoutFrontmatter(app, file, raw);

	const preprocessor = new Preprocessor(app, options.content);
	const { markdown, assets, warnings } = await preprocessor.run(
		body,
		file.path,
	);

	onProgress("Converting with pandoc…");

	const shift = 1 - minHeadingLevel(markdown);
	const pandocArgs = ["-f", PANDOC_FROM, "-t", "typst", "--wrap=preserve"];

	if (shift !== 0) {
		pandocArgs.push(`--shift-heading-level-by=${shift}`);
	}

	const converted = await run(pandoc, pandocArgs, markdown);

	if (converted.code !== 0) {
		throw new PdfRenderError(
			`pandoc failed: ${converted.stderr.trim() || "unknown error"}`,
		);
	}

	// Pandoc labels every heading with a `<slug>` anchor; useless in a PDF.
	const typstBody = converted.stdout.replace(/\n<[A-Za-z0-9_-]+>\n/g, "\n");

	const mathBefore = countMath(markdown);
	const mathAfter = countMath(typstBody);

	if (mathBefore !== mathAfter) {
		warnings.push(
			`Math spans: ${mathBefore} in the note, ${mathAfter} in the output — check the result.`,
		);
	}

	const buildDir = await fs.promises.mkdtemp(
		path.join(nodeOs().tmpdir(), "orbnaments-pdf-"),
	);

	try {
		await writeAssets(app, assets, path.join(buildDir, "assets"), warnings);

		const preamble = fillPreamble(
			await readPreambleTemplate(app),
			options.document,
			options.layout,
		);
		const typPath = path.join(buildDir, "note.typ");

		await fs.promises.writeFile(
			typPath,
			`${preamble}\n${CALLOUT_PRELUDE}\n${typstBody}`,
			"utf8",
		);

		onProgress("Typesetting with Typst…");

		const folder = expandHome(options.output.folder.trim() || "~/Desktop");
		await fs.promises.mkdir(folder, { recursive: true });

		const pdfPath = await uniquePdfPath(folder, file.basename);
		const compiled = await run(typst, [
			"compile",
			"--root",
			buildDir,
			typPath,
			pdfPath,
		]);

		if (compiled.code !== 0) {
			throw new PdfRenderError(
				`Typst failed: ${compiled.stderr.trim() || "unknown error"}`,
			);
		}

		return { pdfPath, warnings };
	} finally {
		await fs.promises
			.rm(buildDir, { recursive: true, force: true })
			.catch(() => undefined);
	}
}
