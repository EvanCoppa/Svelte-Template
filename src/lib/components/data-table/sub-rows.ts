/**
 * The two facts `DataTable.SubRow` and `DataTable.SubSection` share: what a
 * nested cell looks like, and what rule sits above it.
 */

/**
 * A nested cell reads as part of the record above it rather than as a record
 * of its own: the same column boundaries and padding as a row of the table,
 * a tint over them, and smaller, quieter text.
 */
export const SUB_CELL = 'bg-muted/60 py-1.5 text-xs';

/**
 * Where a nested row sits in the run under an open record:
 *
 * - `start` — the first one, marking where the record's own row ends and the
 *   rows it opened begin;
 * - `section` — the first of a later group, separating it from the group above;
 * - `row` — one more row of the group it is in.
 */
export type SubDivider = 'start' | 'section' | 'row';

// The rule is on the TOP edge because the table body already owns every cell's
// bottom border, and `border-style` has no per-side utility in Tailwind — hence
// the one arbitrary property, which would otherwise dash all four sides.
const DIVIDERS = {
	start: 'border-t-2 [border-top-style:dashed]',
	section: 'border-t [border-top-style:dotted]',
	row: ''
} satisfies Record<SubDivider, string>;

export function subDividerClass(divider: SubDivider): string {
	return DIVIDERS[divider];
}
