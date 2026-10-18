/*
 * The Node imports below are type-only — they are erased at build time and
 * nothing from them is bundled. The values come from `window.require`.
 */
/* eslint-disable import/no-nodejs-modules */
import type * as ChildProcess from "child_process";
import type * as Fs from "fs";
import type * as Os from "os";
import type * as Path from "path";
/* eslint-enable import/no-nodejs-modules */
import { PdfRenderError } from "./types";

/**
 * Node is reachable from Obsidian's desktop app only. Everything here goes
 * through `window.require` on purpose: a top-level `import "fs"` would break the
 * whole plugin on mobile, whereas this only throws if the command is actually run.
 */
type RequireFn = (id: string) => unknown;

function nodeRequire(id: string): unknown {
	const req = (window as Window & { require?: RequireFn }).require;

	if (typeof req !== "function") {
		throw new PdfRenderError(
			"Rendering to PDF needs Obsidian's desktop app, which shells out to Pandoc and Typst.",
		);
	}

	return req(id);
}

export const nodeFs = () => nodeRequire("fs") as typeof Fs;
export const nodePath = () => nodeRequire("path") as typeof Path;
export const nodeOs = () => nodeRequire("os") as typeof Os;
export const nodeChildProcess = () =>
	nodeRequire("child_process") as typeof ChildProcess;

type Environment = Record<string, string | undefined>;

/** `process` via `require`, so the module never touches a Node global. */
const nodeProcess = () => nodeRequire("process") as { env: Environment };

/**
 * Obsidian launched from Finder inherits a bare PATH, so Homebrew and friends
 * are invisible unless we go looking for them.
 */
function extraPathEntries(): string[] {
	const home = nodeOs().homedir();

	return [
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
		`${home}/.local/bin`,
		`${home}/.cargo/bin`,
		`${home}/bin`,
	];
}

function searchPath(): string[] {
	const path = nodePath();
	const fromEnv = (nodeProcess().env["PATH"] ?? "").split(path.delimiter);

	return [...fromEnv, ...extraPathEntries()].filter(
		(entry) => entry.length > 0,
	);
}

/** PATH handed to the child processes, so they can find each other too. */
function childEnv(): Environment {
	return {
		...nodeProcess().env,
		PATH: [...new Set(searchPath())].join(nodePath().delimiter),
	};
}

function isExecutable(candidate: string): boolean {
	const fs = nodeFs();

	try {
		fs.accessSync(candidate, fs.constants.X_OK);
		return fs.statSync(candidate).isFile();
	} catch {
		return false;
	}
}

const resolved = new Map<string, string>();

/**
 * Find an executable, preferring an explicit path from the settings.
 * Results are cached for the session; `forgetBinaries` clears them.
 */
export function resolveBinary(name: string, override: string): string {
	const trimmed = override.trim();

	if (trimmed.length > 0) {
		if (!isExecutable(trimmed)) {
			throw new PdfRenderError(
				`The configured ${name} path is not an executable file: ${trimmed}`,
			);
		}
		return trimmed;
	}

	const cached = resolved.get(name);
	if (cached) {
		return cached;
	}

	const path = nodePath();

	for (const dir of searchPath()) {
		const candidate = path.join(dir, name);

		if (isExecutable(candidate)) {
			resolved.set(name, candidate);
			return candidate;
		}
	}

	throw new PdfRenderError(
		`Could not find ${name} on the PATH. Install it, or set its full path in the Orbnaments settings.`,
	);
}

/** Drops the cached lookups, so a freshly installed binary is picked up. */
export function forgetBinaries(): void {
	resolved.clear();
}

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Spawn a binary, optionally feeding it stdin, and collect its output. */
export function run(
	binary: string,
	args: string[],
	input?: string,
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = nodeChildProcess().spawn(binary, args, {
			env: childEnv(),
		});

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => (stdout += chunk));
		child.stderr.on("data", (chunk: string) => (stderr += chunk));

		child.on("error", (error) =>
			reject(
				new PdfRenderError(
					`Could not run ${binary}: ${error.message}`,
					error,
				),
			),
		);

		child.on("close", (code) =>
			resolve({ code: code ?? 0, stdout, stderr }),
		);

		if (input !== undefined) {
			child.stdin.end(input, "utf8");
		} else {
			child.stdin.end();
		}
	});
}

/** Expands a leading `~` so settings can hold `~/Desktop`. */
export function expandHome(target: string): string {
	if (target === "~") {
		return nodeOs().homedir();
	}

	if (target.startsWith("~/")) {
		return nodePath().join(nodeOs().homedir(), target.slice(2));
	}

	return target;
}

/** Hands a path outside the vault to the OS default application. */
export async function openExternally(target: string): Promise<void> {
	const electron = nodeRequire("electron") as {
		shell?: { openPath(target: string): Promise<string> };
	};

	const error = await electron.shell?.openPath(target);

	if (error) {
		throw new PdfRenderError(`Could not open the PDF: ${error}`);
	}
}
