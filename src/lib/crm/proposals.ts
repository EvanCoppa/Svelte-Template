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

/** The parts of an option's price the builder knows before the row exists. */
export type OptionPricing = {
	base_price?: number;
	fee_override: number | null;
	discount_pct: number | null;
	line_items: readonly { quantity: number; unit_cost: number }[];
};

/** Round to cents, as every step of the stored formula does. */
function cents(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * What an option will come to, as the builder types it — the same formula as
 * `private.proposal_option_total()` (docs/proposals.md, "Money is
 * server-owned"): discounts apply to the work, the fee (the option's
 * override, else the proposal's default) is added after them, tax applies to
 * everything, and each step rounds to cents. A preview only: the database
 * computes and stores the real figure on save, and this never reaches it.
 */
export function estimateOptionTotal(
	option: OptionPricing,
	proposal: { default_fee: number | null; tax_rate: number | null }
): number {
	const work =
		(option.base_price ?? 0) +
		option.line_items.reduce((sum, line) => sum + cents(line.quantity * line.unit_cost), 0);
	const discounted = Math.max(work - cents((work * (option.discount_pct ?? 0)) / 100), 0);
	const preTax = discounted + (option.fee_override ?? proposal.default_fee ?? 0);
	return cents(preTax + cents((preTax * (proposal.tax_rate ?? 0)) / 100));
}
