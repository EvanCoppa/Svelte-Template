/**
 * Option shapes for `Combobox.svelte`.
 *
 * Kept in a plain module because `tsc` reads `.svelte` files through Svelte's
 * ambient default-only shim and cannot follow a named type export out of one.
 * Non-component callers (page `load` helpers, option catalogues in `$lib`)
 * import from here; component callers may use the re-export on `index.ts`.
 */

export interface ComboboxOption {
	value: string;
	label: string;
	/** Second line under the label — the org a person belongs to, an email, a slug. */
	sublabel?: string | undefined;
	/** Nesting level. Indents the row so a tree of categories reads as a tree. */
	depth?: number | undefined;
	/** Secondary text pinned to the right of the row: a count, a date, a badge word. */
	hint?: string | number | null | undefined;
	disabled?: boolean | undefined;
}

export interface ComboboxGroup {
	/** Section heading. `null` renders the options with no heading, flush at the top. */
	label: string | null;
	options: readonly ComboboxOption[];
	/** Muted note beside the heading, e.g. a count. */
	hint?: string | null | undefined;
}

/** Anything a call site can hand to `options`: full option objects or bare strings. */
export type ComboboxOptionInput = ComboboxOption | string;

/** Bare strings are shorthand for an option whose value and label coincide. */
function isBareOption(option: ComboboxOptionInput): option is string {
	return typeof option === 'string';
}

export function normalizeOption(option: ComboboxOptionInput): ComboboxOption {
	return isBareOption(option) ? { value: option, label: option } : option;
}

/**
 * Turn a `{ value: label }` map into options. Most of this codebase keeps its
 * enum labels that way (`ORG_POSITION_LABELS`, `SOURCE_LABELS`, …), and every
 * call site was otherwise writing the same `Object.entries(...).map(...)`.
 */
export function optionsFromLabels(labels: Record<string, string>): ComboboxOption[] {
	return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

/**
 * Guard for filter bars reading their value out of the query string or a saved
 * preference. A stale value naming an option that no longer exists must fall
 * back to the placeholder rather than leave the trigger blank while the dead
 * value rides along in the hidden input and back into the next request.
 */
export function legalValue(
	options: readonly ComboboxOption[],
	value: string | null | undefined
): string {
	return options.some((option) => option.value === value) ? (value ?? '') : '';
}
