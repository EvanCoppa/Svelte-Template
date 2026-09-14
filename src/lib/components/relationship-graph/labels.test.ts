import { describe, expect, it } from 'vitest';
import { boxFor, namesAt, placeLabels, truncate, type LabelRequest } from './labels';

/**
 * The decluttering pass: which names the map has room for, where each one
 * sits, and how a long one is cut. Screen pixels throughout — the component
 * measures the text and does the drawing, and nothing here touches a canvas.
 */

const request = (id: string, over: Partial<LabelRequest> = {}): LabelRequest => ({
	id,
	x: 0,
	y: 0,
	radius: 5,
	width: 100,
	height: 14,
	priority: 0,
	...over
});

/** A canvas big enough that nothing is dropped for being off screen. */
const roomy = { width: 10_000, height: 10_000 };

describe('namesAt', () => {
	it('names a hub from across the map and a leaf only up close', () => {
		// A record with fifty relationships is named at every zoom the map has.
		expect(namesAt(0.2, 50)).toBe(true);
		// A record with none waits until the reader is close enough.
		expect(namesAt(0.2, 0)).toBe(false);
		expect(namesAt(2, 0)).toBe(true);
	});

	it('trades zoom off against standing rather than gating each separately', () => {
		// The same record, named as the map comes closer.
		expect(namesAt(0.2, 3)).toBe(false);
		expect(namesAt(0.4, 3)).toBe(true);
		// At one zoom, the better connected record is named first.
		expect(namesAt(0.25, 2)).toBe(false);
		expect(namesAt(0.25, 6)).toBe(true);
	});
});

describe('boxFor', () => {
	it('puts a name clear of its own dot on every side', () => {
		const it_ = request('a', { x: 200, y: 100, radius: 10, width: 60, height: 14 });
		expect(boxFor(it_, 'below')).toEqual({ x: 170, y: 114, width: 60, height: 14 });
		expect(boxFor(it_, 'above')).toEqual({ x: 170, y: 72, width: 60, height: 14 });
		expect(boxFor(it_, 'right')).toEqual({ x: 214, y: 93, width: 60, height: 14 });
		expect(boxFor(it_, 'left')).toEqual({ x: 126, y: 93, width: 60, height: 14 });
	});
});

describe('placeLabels', () => {
	it('draws a name where it asked when nothing is in the way', () => {
		const placed = placeLabels([request('a', { x: 500, y: 500 })], roomy);
		expect(placed).toEqual([{ id: 'a', x: 450, y: 516, anchor: 'below' }]);
	});

	it('tries the other sides of a dot before giving a name up', () => {
		// The room below the second dot is taken by the first dot's name, but
		// above it is free — so both are drawn rather than one.
		const placed = placeLabels(
			[
				request('a', { x: 500, y: 500, priority: 10 }),
				request('b', { x: 500, y: 512, priority: 1 })
			],
			roomy
		);
		expect(placed).toHaveLength(2);
		expect(placed.find((p) => p.id === 'b')?.anchor).toBe('above');
	});

	it('leaves out the name that has nowhere left to go', () => {
		// Three records in the same spot: two sides are free, the third name
		// is left off rather than drawn over one of them.
		const placed = placeLabels(
			[
				request('hub', { x: 500, y: 500, priority: 40 }),
				request('mid', { x: 500, y: 500, priority: 20 }),
				request('leaf', { x: 500, y: 500, priority: 1 })
			],
			roomy
		);
		expect(placed.map((p) => p.id)).toEqual(['hub', 'mid']);
	});

	it('keeps the better connected names when they collide, whatever order they arrive in', () => {
		const crowd = [
			request('leaf', { x: 500, y: 500, priority: 1 }),
			request('hub', { x: 500, y: 500, priority: 40 }),
			request('mid', { x: 500, y: 500, priority: 20 })
		];
		expect(placeLabels(crowd, roomy).map((p) => p.id)).toEqual(['hub', 'mid']);
		expect(placeLabels([...crowd].reverse(), roomy).map((p) => p.id)).toEqual(['hub', 'mid']);
	});

	it('draws the name under the pointer whatever it covers', () => {
		// `lit` arrives last and lowest, and is still drawn — first, and on top.
		const placed = placeLabels(
			[
				request('hub', { x: 500, y: 500, priority: 99 }),
				request('lit', { x: 501, y: 500, priority: 0, required: true })
			],
			roomy
		);
		expect(placed[0]?.id).toBe('lit');
		expect(placed.map((p) => p.id).sort()).toEqual(['hub', 'lit']);
	});

	it('leaves off a name that would run past the edge of the canvas', () => {
		// Room for the name to the left of the dot, and nowhere else.
		const placed = placeLabels([request('a', { x: 195, y: 10, width: 100, height: 14 })], {
			width: 200,
			height: 200
		});
		expect(placed).toEqual([{ id: 'a', x: 86, y: 10, anchor: 'left' }]);
		expect(placeLabels([request('a', { x: 5, y: 5 })], { width: 40, height: 40 })).toEqual([]);
	});

	it('draws the same map the same way twice', () => {
		// Three names of equal standing in the same place: the two drawn are
		// the two drawn last time, not whichever the sort happened to land on.
		const tied = [
			request('c', { x: 500, y: 500 }),
			request('a', { x: 500, y: 500 }),
			request('b', { x: 500, y: 500 })
		];
		expect(placeLabels(tied, roomy).map((p) => p.id)).toEqual(['a', 'b']);
		expect(placeLabels([...tied].reverse(), roomy).map((p) => p.id)).toEqual(['a', 'b']);
	});
});

describe('truncate', () => {
	// One pixel a character, so the arithmetic in the test is the arithmetic
	// a canvas would do.
	const measure = (text: string) => text.length;

	it('leaves a name that fits alone', () => {
		expect(truncate('Soul Dental', 40, measure)).toBe('Soul Dental');
	});

	it('cuts a long name to the room there is', () => {
		const cut = truncate('Upper West Side Oral And Maxillofacial Surgery', 20, measure);
		expect(cut).toBe('Upper West Side Ora…');
		expect(measure(cut)).toBeLessThanOrEqual(20);
	});

	it('does not leave a space hanging before the ellipsis', () => {
		expect(truncate('Gentle Dental Care', 7, measure)).toBe('Gentle…');
	});

	it('falls back to the ellipsis alone when there is room for nothing', () => {
		expect(truncate('Gentle Dental', 1, measure)).toBe('…');
	});
});
