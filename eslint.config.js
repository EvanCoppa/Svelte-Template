import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	{
		// Vendored agent skills are documentation, not project source. Their
		// example components sit outside tsconfig's include, so the typed
		// `projectService` below cannot resolve them and errors on every one.
		// `.prettierignore` skips this directory for the same reason.
		ignores: ['.claude/skills/**']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// TypeScript already catches undefined identifiers, with an
			// understanding of ambient types eslint doesn't have.
			'no-undef': 'off',
			// This template deploys at the domain root, where resolve() from
			// $app/paths is a no-op; the rule only earns its keep with a
			// configured base path. Re-enable it if you set kit.paths.base.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
