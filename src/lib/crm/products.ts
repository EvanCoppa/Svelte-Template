import type { Enums } from '$lib/database.types';
import type { ProductOrderLine } from '$lib/server/crm/orders';

/**
 * What a product's page says about how it sells and how much of it is left —
 * pure folds over the order lines that cite it, on both sides of the wire.
 *
 * A line counts as SOLD once its order is confirmed and nobody has cancelled
 * or returned the line; a draft is an intention and a cancellation is a
 * change of mind. It counts as ALLOCATED while it is sold and still in the
 * building — the carrier has not written `shipped` yet — because that is the
 * stock a new order cannot have. Both are read off the columns the orders
 * migration derives, never stored on the product (its decision about
 * `quantity_reserved`).
 *
 * "Last 30 days" is a wall-clock phrase, so `now` is the caller's: the page
 * folds after hydration in the reader's own clock, the way the ledger sums
 * "overdue".
 */

/** The part of an order line the folds read. */
export type SoldLine = Pick<
	ProductOrderLine,
	'quantity' | 'net_amount' | 'line_total' | 'unit_price' | 'discount' | 'fulfillment_status'
> & {
	orders: Pick<ProductOrderLine['orders'], 'id' | 'status' | 'created_at' | 'confirmed_at'>;
};

const NOT_SOLD = new Set<Enums<'line_fulfillment_status'>>(['cancelled', 'returned']);
const IN_THE_BUILDING = new Set<Enums<'line_fulfillment_status'>>([
	'pending',
	'processing',
	'backordered'
]);

/** Whether a line is a sale: on a confirmed order and not undone since. */
export function isSold(line: SoldLine): boolean {
	return line.orders.status === 'confirmed' && !NOT_SOLD.has(line.fulfillment_status);
}

/** When the sale happened — the confirmation, or the order's creation before one exists. */
export function soldAt(line: SoldLine): Date {
	return new Date(line.orders.confirmed_at ?? line.orders.created_at);
}

/** What a line brought in: the trigger's net amount, else the total, else the arithmetic. */
export function lineRevenue(line: SoldLine): number {
	return (
		line.net_amount ??
		line.line_total ??
		Math.max(0, line.quantity * line.unit_price - line.discount)
	);
}

/** Units sold and still to ship — the stock a new order cannot have. */
export function allocatedQuantity(lines: readonly SoldLine[]): number {
	return lines
		.filter((line) => isSold(line) && IN_THE_BUILDING.has(line.fulfillment_status))
		.reduce((sum, line) => sum + line.quantity, 0);
}

export type SalesWindow = {
	units: number;
	revenue: number;
	/** Distinct orders the lines were on. */
	orders: number;
	/** Revenue per order, or null with no orders. */
	averageOrder: number | null;
};

export type SalesSummary = {
	/** How many days each window spans. */
	days: number;
	current: SalesWindow;
	previous: SalesWindow;
	/** Revenue change against the previous window as a fraction, or null when there was nothing to compare with. */
	change: number | null;
	/** Revenue per local day of the current window, oldest first — the sparkline. */
	series: { day: Date; revenue: number }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of the local day `days` before `now`. */
function dayStart(now: Date, days: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
}

function windowOf(lines: readonly SoldLine[]): SalesWindow {
	const orders = new Set(lines.map((line) => line.orders.id));
	const revenue = lines.reduce((sum, line) => sum + lineRevenue(line), 0);
	return {
		units: lines.reduce((sum, line) => sum + line.quantity, 0),
		revenue,
		orders: orders.size,
		averageOrder: orders.size > 0 ? revenue / orders.size : null
	};
}

/**
 * The last `days` local days of sales against the `days` before them. The
 * current window runs from the start of the day `days - 1` days ago through
 * `now`, so today is in it and its series has exactly `days` points.
 */
export function salesSummary(lines: readonly SoldLine[], now: Date, days = 30): SalesSummary {
	const sold = lines.filter(isSold);
	const currentStart = dayStart(now, days - 1);
	const previousStart = dayStart(now, 2 * days - 1);

	const current = sold.filter((line) => soldAt(line) >= currentStart && soldAt(line) <= now);
	const previous = sold.filter((line) => {
		const at = soldAt(line);
		return at >= previousStart && at < currentStart;
	});

	const series = Array.from({ length: days }, (_, index) => ({
		day: new Date(currentStart.getTime() + index * DAY_MS),
		revenue: 0
	}));
	for (const line of current) {
		const index = Math.min(
			days - 1,
			Math.max(0, Math.floor((soldAt(line).getTime() - currentStart.getTime()) / DAY_MS))
		);
		series[index].revenue += lineRevenue(line);
	}

	const currentWindow = windowOf(current);
	const previousWindow = windowOf(previous);
	return {
		days,
		current: currentWindow,
		previous: previousWindow,
		change:
			previousWindow.revenue > 0
				? (currentWindow.revenue - previousWindow.revenue) / previousWindow.revenue
				: null,
		series
	};
}
