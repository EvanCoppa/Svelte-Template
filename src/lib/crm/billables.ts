/**
 * How a billable line counts its units — client-safe, so the builder
 * previews the same quantity the action stores.
 *
 * A billable is priced per unit (a tooth, a quadrant, a square of roof), and
 * the line records which units as typed or picked: "12, 13", "1-3 5",
 * "UR, UL". Ported from Yes Smile's `parseTeethString`, minus the dental
 * tooth-surface suffix: tokens split on commas and whitespace, an ascending
 * numeric range expands to its members, and every other token counts one.
 */

/** The units a detail string names, one entry per billable unit. */
export function unitTokens(detail: string): string[] {
	return detail
		.split(/[,\s]+/)
		.map((part) => part.trim())
		.filter(Boolean)
		.flatMap((part) => {
			const range = /^(\d+)-(\d+)$/.exec(part);
			if (range) {
				const start = Number(range[1]);
				const end = Number(range[2]);
				// A reversed range names nothing, the same as the source.
				if (start > end) return [];
				return Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
			}
			return [part];
		});
}

/**
 * What a billable line is charged for: one per unit, never less than one —
 * a line with no units named is still one of the thing. Not applicable
 * (no units make sense for it) is one as well.
 */
export function billableQuantity(detail: string, notApplicable: boolean): number {
	if (notApplicable) return 1;
	return Math.max(1, unitTokens(detail).length);
}
