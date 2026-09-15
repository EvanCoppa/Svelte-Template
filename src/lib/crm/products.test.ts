import { describe, expect, it } from 'vitest';
import {
	allocatedQuantity,
	isSold,
	lineRevenue,
	salesSummary,
	soldAt,
	type SoldLine
} from './products';

/** Local noon, so a day boundary is never a zone away — the task board's rule. */
const NOW = new Date(2026, 8, 15, 12, 0, 0);

function line(
	daysAgo: number,
	overrides: Partial<Omit<SoldLine, 'orders'>> & { order?: Partial<SoldLine['orders']> } = {}
): SoldLine {
	const at = new Date(2026, 8, 15 - daysAgo, 9, 0, 0).toISOString();
	const { order, ...rest } = overrides;
	return {
		quantity: 2,
		unit_price: 10,
		discount: 0,
		net_amount: 20,
		line_total: 20,
		fulfillment_status: 'pending',
		...rest,
		orders: {
			id: `order-${String(daysAgo)}`,
			status: 'confirmed',
			created_at: at,
			confirmed_at: at,
			...order
		}
	};
}

describe('isSold', () => {
	it('counts a confirmed order’s line that nobody undid', () => {
		expect(isSold(line(1))).toBe(true);
		expect(isSold(line(1, { fulfillment_status: 'delivered' }))).toBe(true);
	});

	it('leaves out drafts, cancellations and returns', () => {
		expect(isSold(line(1, { order: { status: 'draft' } }))).toBe(false);
		expect(isSold(line(1, { order: { status: 'cancelled' } }))).toBe(false);
		expect(isSold(line(1, { fulfillment_status: 'cancelled' }))).toBe(false);
		expect(isSold(line(1, { fulfillment_status: 'returned' }))).toBe(false);
	});
});

describe('soldAt and lineRevenue', () => {
	it('dates a sale by its confirmation, falling back to the order’s creation', () => {
		const created = new Date(2026, 8, 1).toISOString();
		const confirmed = new Date(2026, 8, 3).toISOString();
		expect(soldAt(line(0, { order: { created_at: created, confirmed_at: confirmed } }))).toEqual(
			new Date(confirmed)
		);
		expect(soldAt(line(0, { order: { created_at: created, confirmed_at: null } }))).toEqual(
			new Date(created)
		);
	});

	it('prefers the derived amounts and only then does the arithmetic', () => {
		expect(lineRevenue(line(0, { net_amount: 18, line_total: 20 }))).toBe(18);
		expect(lineRevenue(line(0, { net_amount: null, line_total: 19 }))).toBe(19);
		expect(
			lineRevenue(
				line(0, { net_amount: null, line_total: null, quantity: 3, unit_price: 5, discount: 2 })
			)
		).toBe(13);
	});
});

describe('allocatedQuantity', () => {
	it('adds up what is sold and still in the building', () => {
		const lines = [
			line(1, { quantity: 4 }),
			line(2, { quantity: 3, fulfillment_status: 'backordered' }),
			line(3, { quantity: 5, fulfillment_status: 'shipped' }),
			line(4, { quantity: 6, fulfillment_status: 'cancelled' }),
			line(5, { quantity: 7, order: { status: 'draft' } })
		];
		expect(allocatedQuantity(lines)).toBe(7);
	});
});

describe('salesSummary', () => {
	it('splits the last 30 days from the 30 before and reports the change', () => {
		const lines = [
			line(0, { net_amount: 50 }),
			line(29, { net_amount: 50, quantity: 3 }),
			line(30, { net_amount: 40 }),
			line(59, { net_amount: 10 }),
			line(60, { net_amount: 999 }),
			line(5, { net_amount: 999, order: { status: 'draft' } })
		];
		const summary = salesSummary(lines, NOW);

		expect(summary.days).toBe(30);
		expect(summary.current).toEqual({ units: 5, revenue: 100, orders: 2, averageOrder: 50 });
		expect(summary.previous).toEqual({ units: 4, revenue: 50, orders: 2, averageOrder: 25 });
		expect(summary.change).toBe(1);
	});

	it('has nothing to compare with when the previous window was empty', () => {
		const summary = salesSummary([line(1)], NOW);
		expect(summary.change).toBeNull();
		expect(summary.previous.averageOrder).toBeNull();
	});

	it('draws one point per local day, oldest first, today last', () => {
		const summary = salesSummary([line(0, { net_amount: 7 }), line(29, { net_amount: 3 })], NOW);
		expect(summary.series).toHaveLength(30);
		expect(summary.series[0].day).toEqual(new Date(2026, 7, 17));
		expect(summary.series[0].revenue).toBe(3);
		expect(summary.series[29].revenue).toBe(7);
		expect(summary.series.slice(1, 29).every((point) => point.revenue === 0)).toBe(true);
	});

	it('counts two lines on one order as one order', () => {
		const summary = salesSummary(
			[line(1, { order: { id: 'same' } }), line(2, { order: { id: 'same' }, net_amount: 30 })],
			NOW
		);
		expect(summary.current.orders).toBe(1);
		expect(summary.current.averageOrder).toBe(50);
	});
});
