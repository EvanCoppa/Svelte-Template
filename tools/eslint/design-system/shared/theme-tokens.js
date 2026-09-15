/**
 * The theme tokens `src/app.css` actually defines, read once per process, so
 * the rule's message names colours that exist in this project rather than a
 * hardcoded list that drifts the first time a token is added or renamed.
 */
import { readFileSync } from 'node:fs';

/** Keyed by path, so a second configured theme file is not served the first one's tokens. */
/** @type {Map<string, string[]>} */
const cache = new Map();

/**
 * @param {string} cssPath
 * @returns {string[]}
 */
function themeColorTokens(cssPath) {
	const hit = cache.get(cssPath);
	if (hit !== undefined) return hit;

	/** @type {string[]} */
	const names = [];
	try {
		const css = readFileSync(cssPath, 'utf8');
		for (const match of css.matchAll(/^\s*--color-([a-z0-9-]+):/gm)) names.push(match[1]);
	} catch {
		// A missing or unreadable app.css only costs the suggestions, never the
		// finding — the class is still unpaired.
	}

	cache.set(cssPath, names);
	return names;
}

/**
 * Which tokens are worth suggesting for a given colour utility: ink colours for
 * `text`, surfaces for `bg`, and the line tokens for the border-ish utilities.
 *
 * @param {string} utility
 * @param {string} cssPath
 * @returns {string[]}
 */
export function suggestedTokens(utility, cssPath) {
	const tokens = themeColorTokens(cssPath);
	if (tokens.length === 0) return [];

	/** @param {(name: string) => boolean} keep */
	const pick = (keep) => tokens.filter(keep).map((name) => `${utility}-${name}`);

	if (utility === 'text' || utility === 'fill' || utility === 'stroke') {
		return pick(
			(name) =>
				name.endsWith('-foreground') ||
				name === 'foreground' ||
				name === 'destructive' ||
				name === 'primary'
		).slice(0, 5);
	}

	if (utility === 'bg') {
		return pick(
			(name) => !name.endsWith('-foreground') && !['border', 'input', 'ring'].includes(name)
		).slice(0, 5);
	}

	return pick((name) => ['border', 'input', 'ring'].includes(name)).slice(0, 3);
}
