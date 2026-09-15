import type { Enums } from '$lib/database.types';

/**
 * What a coupon says, in words — the one place `discount_type` and
 * `discount_value` are read together.
 *
 * A coupon's discount prints in a different unit depending on its type: a
 * share of the price, or a sum in its currency. That makes it text rather
 * than a money or a number cell (a cell is typed by how it renders, the
 * `RecordDetail` rule), and text the list and the record page must agree on
 * — so it is computed here, client-safe, the way `unitTokens()` is for a
 * billable's units.
 */
export function couponDiscountText(coupon: {
	discount_type: Enums<'coupon_discount_type'>;
	discount_value: number;
	currency: string;
}): string {
	if (coupon.discount_type === 'percent') {
		// A whole percentage reads as "20%", not "20.00%"; the column keeps two
		// decimals so half a point is sayable.
		return `${percent.format(coupon.discount_value)}%`;
	}
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: coupon.currency
	}).format(coupon.discount_value);
}

const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
