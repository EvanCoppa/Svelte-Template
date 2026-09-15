import { RuleTester } from 'eslint';
import * as svelteParser from 'svelte-eslint-parser';
import { describe } from 'vitest';
import { requireDarkVariant } from './require-dark-variant.js';

const ts = new RuleTester({
	languageOptions: { ecmaVersion: 2023, sourceType: 'module' }
});

const svelte = new RuleTester({
	languageOptions: { parser: svelteParser, ecmaVersion: 2023, sourceType: 'module' }
});

describe('require-dark-variant', () => {
	svelte.run('svelte markup', requireDarkVariant, {
		valid: [
			// A token needs no pair — it is already both themes.
			{ code: '<div class="text-foreground bg-card" />' },
			// A dark: pair on the same utility, whether it lands on a token…
			{ code: '<div class="text-gray-700 dark:text-foreground" />' },
			// …or on another palette step.
			{ code: '<div class="bg-blue-100 dark:bg-blue-950" />' },
			// The same colour in both themes, stated rather than assumed —
			// the idiom src/lib/calendar.ts already uses for event dots.
			{ code: '<div class="bg-slate-400 dark:bg-slate-400" />' },
			// One class attribute is one list, so a ternary arm that sets dark:
			// answers for the arm that sets the light value.
			{
				code: "<div class=\"p-2 {on ? 'bg-blue-600 text-white' : 'dark:bg-card bg-white dark:text-foreground text-gray-700'}\" />"
			},
			// An opacity modifier does not hide the pair.
			{ code: '<div class="bg-red-500/65 dark:bg-red-400/65" />' },
			// A `:` inside brackets must not be read as a variant separator.
			{ code: '<div class="supports-[display:grid]:bg-gray-100 dark:bg-muted" />' },
			// Prose that merely mentions a class is not a class list.
			{ code: '<script>const hint = "Use bg-red-500 for errors";</script>' }
		],
		invalid: [
			{
				code: '<div class="text-gray-700" />',
				errors: [{ messageId: 'unpaired' }]
			},
			// Pairing is per utility: a dark: background does not answer for the text.
			{
				code: '<div class="bg-gray-100 dark:bg-muted text-gray-700" />',
				errors: [{ messageId: 'unpaired' }]
			},
			// white and black are raw colours too.
			{ code: '<div class="bg-white" />', errors: [{ messageId: 'unpaired' }] },
			// A variant does not excuse the pair.
			{ code: '<div class="hover:text-blue-700" />', errors: [{ messageId: 'unpaired' }] },
			// Directional borders are their own utility.
			{
				code: '<div class="border-t-gray-200 dark:border-border" />',
				errors: [{ messageId: 'unpaired' }]
			}
		]
	});

	ts.run('class strings in modules', requireDarkVariant, {
		valid: [
			{ code: "export const input = 'border-gray-300 dark:border-input';" },
			{ code: "const c = cn('text-gray-500', 'dark:text-muted-foreground');" },
			// Not a class list: capitalised words are prose.
			{ code: "const label = 'Overdue by text-red-500 days';" },
			// No colour at all.
			{ code: "const c = cn('flex items-center gap-2');" }
		],
		invalid: [
			{ code: "export const err = 'text-red-500 text-sm';", errors: [{ messageId: 'unpaired' }] },
			{
				code: "const c = cn('bg-gray-50', cond && 'border-gray-200');",
				errors: [{ messageId: 'unpaired' }, { messageId: 'unpaired' }]
			},
			{
				code: "const t = tv({ base: 'bg-amber-100 text-amber-800' });",
				errors: [{ messageId: 'unpaired' }, { messageId: 'unpaired' }]
			}
		]
	});
});
