import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		plugins: { obsidianmd },
		rules: {
			// Teach the rule the proper nouns and acronyms this plugin uses, and
			// let literal placeholders (paths, date formats) through untouched.
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					brands: [
						"Obsidian",
						"Pandoc",
						"SteamGridDB",
						"Syncthing",
						"Typst",
					],
					acronyms: ["API", "PATH", "PDF", "PDFs", "URL"],
					ignoreRegex: [
						"^[~/.]",
						"^[A-Z][A-Z-]+$",
					],
				},
			],
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
