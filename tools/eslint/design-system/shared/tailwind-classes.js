/**
 * Parsing Tailwind class tokens far enough to answer one question: does this
 * token paint a colour, and if so, which CSS property and with what value?
 *
 * Plain JS with JSDoc types rather than TypeScript, unlike the oxlint
 * anti-slop plugin next door: oxlint loads `.ts` natively, but `eslint.config.js`
 * is an ES module Node imports directly, and on the Node 22 line type stripping
 * still prints an ExperimentalWarning on every `npm run lint`.
 */

/** Tailwind's built-in palettes — the colours that are NOT theme tokens. */
export const RAW_PALETTES = new Set([
	'slate',
	'gray',
	'zinc',
	'neutral',
	'stone',
	'red',
	'orange',
	'amber',
	'yellow',
	'lime',
	'green',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'blue',
	'indigo',
	'violet',
	'purple',
	'fuchsia',
	'pink',
	'rose'
]);

/**
 * Utilities that set a colour, longest first so `border-t` wins over `border`
 * and `ring-offset` over `ring`. A pair is required per utility, so
 * `border-t-gray-300` is answered by `dark:border-t-…`, not by `dark:bg-…`.
 */
export const COLOR_UTILITIES = [
	'ring-offset',
	'border-t',
	'border-r',
	'border-b',
	'border-l',
	'border-x',
	'border-y',
	'border-s',
	'border-e',
	'placeholder',
	'decoration',
	'divide',
	'outline',
	'shadow',
	'accent',
	'border',
	'stroke',
	'caret',
	'text',
	'fill',
	'ring',
	'from',
	'via',
	'bg',
	'to'
];

/**
 * Split a class token into its variant chain and its base utility, respecting
 * brackets so `supports-[display:grid]:flex` and
 * `[&_[data-slot=x]]:data-[state=checked]:bg-blue-600` survive intact.
 *
 * @param {string} token
 * @returns {{ variants: string[], base: string }}
 */
export function splitVariants(token) {
	const variants = [];
	let depth = 0;
	let start = 0;

	for (let i = 0; i < token.length; i += 1) {
		const char = token[i];
		if (char === '[' || char === '(') depth += 1;
		else if (char === ']' || char === ')') depth -= 1;
		else if (char === ':' && depth === 0) {
			variants.push(token.slice(start, i));
			start = i + 1;
		}
	}

	return { variants, base: token.slice(start) };
}

/**
 * The colour utility a base sets, or null when it sets no colour. Answers for
 * theme tokens (`text-foreground`) as well as palette values (`text-gray-700`),
 * because a `dark:` pair may be written either way.
 *
 * @param {string} base
 * @returns {string | null}
 */
export function colorUtilityOf(base) {
	const value = base.replace(/^-/, '');
	for (const utility of COLOR_UTILITIES) {
		if (value.startsWith(`${utility}-`)) return utility;
	}
	return null;
}

/**
 * The raw palette colour a base names, or null. `bg-blue-950/50` and
 * `text-white` both count; `text-foreground` does not, because it is a token.
 *
 * @param {string} base
 * @returns {{ utility: string, color: string } | null}
 */
export function rawColorOf(base) {
	const utility = colorUtilityOf(base);
	if (utility === null) return null;

	// Drop an opacity modifier: `/50`, `/[0.55]`.
	const value = base.slice(utility.length + 1).replace(/\/(\[[^\]]*\]|[\d.]+)$/, '');

	if (value === 'white' || value === 'black') return { utility, color: value };

	const match = /^([a-z]+)-(\d{2,3})$/.exec(value);
	if (match !== null && RAW_PALETTES.has(match[1])) return { utility, color: value };

	return null;
}

/**
 * The raw colour classes in one class list that the list never restates for
 * dark mode. A list is one element's `class` attribute or one `cn()`/`tv()`
 * call — every string in it, including both arms of a ternary, because a
 * branch that sets `dark:` covers the branch that sets the light value.
 *
 * Pairing is matched per utility and ignores other variants: a `dark:` class
 * for the same property is taken as the author having considered dark mode,
 * whether it lands on a token (`dark:text-foreground`) or another palette step.
 *
 * @param {string[]} tokens
 * @returns {Array<{ token: string, utility: string }>}
 */
export function unpairedRawColors(tokens) {
	/** @type {Set<string>} */
	const darkened = new Set();

	for (const token of tokens) {
		const { variants, base } = splitVariants(token);
		if (!variants.includes('dark')) continue;
		const utility = colorUtilityOf(base);
		if (utility !== null) darkened.add(utility);
	}

	/** @type {Array<{ token: string, utility: string }>} */
	const unpaired = [];
	const seen = new Set();

	for (const token of tokens) {
		const { variants, base } = splitVariants(token);
		if (variants.includes('dark')) continue;
		const raw = rawColorOf(base);
		if (raw === null || darkened.has(raw.utility) || seen.has(token)) continue;
		seen.add(token);
		unpaired.push({ token, utility: raw.utility });
	}

	return unpaired;
}

/**
 * Whether a bare string literal is plausibly a class list, used to decide
 * whether to read one that sits outside a `class` attribute or a `cn()` call —
 * the `builderInput` constants in `proposal-builder/classes.ts` are the reason
 * this exists. Deliberately strict: every token must look like a utility, so
 * prose that happens to mention a class is left alone.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeClassList(text) {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return false;
	return tokens.every((token) => /^[a-z[@!.-]/.test(token) && !/[A-Z]/.test(token));
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
	return text.trim().split(/\s+/).filter(Boolean);
}
