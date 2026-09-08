import { describe, expect, it } from 'vitest';
import { estimateOptionTotal, recommendedOption } from './proposals';

describe('recommendedOption', () => {
	it('finds the flagged option, or nothing', () => {
		const options = [{ is_recommended: false }, { is_recommended: true }];
		expect(recommendedOption(options)).toBe(options[1]);
		expect(recommendedOption([{ is_recommended: false }])).toBeNull();
		expect(recommendedOption([])).toBeNull();
	});
});

/**
 * The stored formula (private.proposal_option_total), replayed: the seed's
 * Premium option — base 30,000, two lines (10 × 1,200 and 4 × 500), a 1,000
 * discount, fee override 0, tax 8.25% — and a few edges around it.
 */
describe('estimateOptionTotal', () => {
	const terms = { default_fee: 250, tax_rate: 8.25 };
	const lines = [
		{ quantity: 10, unit_cost: 1200 },
		{ quantity: 4, unit_cost: 500 }
	];

	it('adds the lines to the base, discounts the work, adds the fee, then taxes', () => {
		// work 44,000 − 5% = 41,800 + fee 250 = 42,050, +8.25% = 45,519.13
		expect(
			estimateOptionTotal(
				{ base_price: 30000, fee_override: null, discount_pct: 5, line_items: lines },
				terms
			)
		).toBe(45519.13);
	});

	it('lets the option override the fee, including to nothing', () => {
		expect(
			estimateOptionTotal(
				{ base_price: 30000, fee_override: 0, discount_pct: null, line_items: lines },
				terms
			)
		).toBe(47630);
	});

	it('never discounts below zero, and treats absent terms as zero', () => {
		expect(
			estimateOptionTotal(
				{ fee_override: null, discount_pct: 100, line_items: [{ quantity: 1, unit_cost: 10 }] },
				{ default_fee: null, tax_rate: null }
			)
		).toBe(0);
		expect(
			estimateOptionTotal(
				{ fee_override: null, discount_pct: null, line_items: [] },
				{ default_fee: null, tax_rate: null }
			)
		).toBe(0);
	});

	it('rounds each line, the discount and the tax to cents', () => {
		// 3 × 0.335 = 1.005 → 1.01; no discount; fee 0; tax 8.25% of 1.01 = 0.083 → 0.08
		expect(
			estimateOptionTotal(
				{ fee_override: 0, discount_pct: null, line_items: [{ quantity: 3, unit_cost: 0.335 }] },
				terms
			)
		).toBe(1.09);
	});
});
