/**
 * What a list page and a record describer both read off a proposal's options
 * — client-safe, like `tones.ts`.
 */

/** The option flagged as recommended, or null when none is. */
export function recommendedOption<T extends { is_recommended: boolean }>(
	options: readonly T[]
): T | null {
	return options.find((option) => option.is_recommended) ?? null;
}
