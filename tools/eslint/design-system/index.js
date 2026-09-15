/**
 * design-system — ESLint rules that make this repo's UI conventions checkable
 * instead of merely written down.
 *
 * The sibling of `tools/oxlint/anti-slop`, and split off from it for one
 * reason: these rules read Svelte markup, and oxlint parses JS and TS only.
 * `eslint.config.js` already runs `svelte-eslint-parser` over every `.svelte`
 * file, so ESLint is the linter in this project that can see a `class`
 * attribute at all.
 */
import { requireDarkVariant } from './rules/require-dark-variant.js';

export const designSystem = {
	meta: { name: 'design-system', version: '0.1.0' },
	rules: {
		'require-dark-variant': requireDarkVariant
	}
};
