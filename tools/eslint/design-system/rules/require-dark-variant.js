/**
 * require-dark-variant — a raw Tailwind palette colour must say what it does in
 * dark mode.
 *
 * CLAUDE.md states this twice in prose ("no hardcoded greys, and any raw
 * palette colour (`emerald-500`, `amber-600`) needs its `dark:` pair"), and
 * nothing enforced it, so a class list could paint itself light-mode-only and
 * pass every check in the repo. This is that sentence, checkable.
 *
 * A "class list" is one element's `class` attribute or one `cn()`/`tv()` call —
 * see `unpairedRawColors` for why the whole attribute counts as one scope.
 */
import { unpairedRawColors, looksLikeClassList, tokenize } from '../shared/tailwind-classes.js';
import { suggestedTokens } from '../shared/theme-tokens.js';

const MERGE_FUNCTIONS = new Set([
	'cn',
	'cx',
	'clsx',
	'cva',
	'tv',
	'twMerge',
	'twJoin',
	'classNames'
]);

/** @typedef {{ start: number, end: number, sources: Array<{ node: object, tokens: string[] }> }} Scope */

/** @type {import('eslint').Rule.RuleModule} */
export const requireDarkVariant = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require a dark: pair for every raw Tailwind palette colour, so no class list is painted light-mode-only.'
		},
		schema: [
			{
				type: 'object',
				properties: { themeFile: { type: 'string' } },
				additionalProperties: false
			}
		],
		messages: {
			unpaired:
				'`{{token}}` paints `{{utility}}` from a raw Tailwind palette, and this class list has no `dark:` pair for it — the light-mode colour is what dark mode will show.\nUse a theme token from {{themeFile}} instead{{suggestions}}, or add the pair (`dark:{{utility}}-…`).\nIf the colour is deliberately identical in both themes, write that: `{{token}} dark:{{token}}`.'
		}
	},

	create(context) {
		const themeFile = context.options[0]?.themeFile ?? 'src/app.css';

		/** @type {Scope[]} */
		const scopes = [];
		/** @type {Array<{ node: object, tokens: string[], start: number, end: number }>} */
		const loose = [];

		/**
		 * Scopes are opened by a parent node, so document order puts the
		 * outermost first — `class={cn('a', 'b')}` is one list, not two.
		 * @param {number} start
		 * @param {number} end
		 */
		const scopeAt = (start, end) =>
			scopes.find((scope) => scope.start <= start && end <= scope.end) ?? null;

		/**
		 * @param {object} node
		 * @param {string} text
		 * @param {[number, number]} range
		 */
		const record = (node, text, range) => {
			const tokens = tokenize(text);
			if (tokens.length === 0) return;

			const scope = scopeAt(range[0], range[1]);
			if (scope !== null) {
				scope.sources.push({ node, tokens });
				return;
			}
			if (looksLikeClassList(text)) {
				loose.push({ node, tokens, start: range[0], end: range[1] });
			}
		};

		/** @param {Scope['sources']} sources */
		const check = (sources) => {
			const tokens = sources.flatMap((source) => source.tokens);
			for (const { token, utility } of unpairedRawColors(tokens)) {
				const source = sources.find((candidate) => candidate.tokens.includes(token));
				if (source === undefined) continue;
				const suggestions = suggestedTokens(utility, themeFile);
				context.report({
					node: source.node,
					messageId: 'unpaired',
					data: {
						token,
						utility,
						themeFile,
						suggestions: suggestions.length === 0 ? '' : ` (${suggestions.join(', ')})`
					}
				});
			}
		};

		return {
			SvelteAttribute(node) {
				if (node.key?.name !== 'class') return;
				scopes.push({ start: node.range[0], end: node.range[1], sources: [] });
			},

			CallExpression(node) {
				const name =
					node.callee.type === 'Identifier'
						? node.callee.name
						: node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier'
							? node.callee.property.name
							: null;
				if (name === null || !MERGE_FUNCTIONS.has(name)) return;
				scopes.push({ start: node.range[0], end: node.range[1], sources: [] });
			},

			SvelteLiteral(node) {
				record(node, node.value, node.range);
			},

			// esquery's `type(string)` narrows to string literals in the selector,
			// so the node arriving here is already the one this rule is about.
			'Literal[value=type(string)]'(node) {
				record(node, node.value, node.range);
			},

			TemplateLiteral(node) {
				const text = node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
				record(node, text, node.range);
			},

			'Program:exit'() {
				for (const scope of scopes) check(scope.sources);
				for (const entry of loose) check([{ node: entry.node, tokens: entry.tokens }]);
			}
		};
	}
};
