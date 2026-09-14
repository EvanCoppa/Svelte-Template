import { describe, expect, it } from 'vitest';
import {
	boundsOf,
	boundsOfPoints,
	elementAt,
	EMPTY_SCENE,
	movedBy,
	parseScene,
	thinPoints,
	type Point,
	type WhiteboardElement
} from './scene';

function element(over: Partial<WhiteboardElement> = {}): WhiteboardElement {
	return {
		id: 'e1',
		kind: 'rect',
		x: 0,
		y: 0,
		w: 100,
		h: 50,
		ink: 'ink',
		weight: 'thin',
		filled: false,
		points: [],
		text: '',
		...over
	};
}

function stored(elements: WhiteboardElement[]): string {
	return JSON.stringify({ version: EMPTY_SCENE.version, elements });
}

describe('parseScene', () => {
	it('reads a scene back', () => {
		const scene = parseScene(stored([element()]));
		expect(scene.elements).toHaveLength(1);
		expect(scene.elements[0]?.kind).toBe('rect');
	});

	it('opens an empty board when nothing is stored', () => {
		expect(parseScene(null)).toEqual(EMPTY_SCENE);
	});

	it('opens an empty board rather than crash on junk', () => {
		expect(parseScene('not json')).toEqual(EMPTY_SCENE);
		expect(parseScene('null')).toEqual(EMPTY_SCENE);
		expect(parseScene('{"version":1}')).toEqual(EMPTY_SCENE);
	});

	it('refuses a scene from another version', () => {
		expect(parseScene('{"version":99,"elements":[]}')).toEqual(EMPTY_SCENE);
	});

	it('refuses an element with an ink or kind it does not have', () => {
		// SAFETY: the assertion exists to build the invalid element this test is
		// about — an ink the schema does not list. Nothing reads it as an `Ink`;
		// `parseScene` is expected to reject the scene that carries it.
		expect(parseScene(stored([element({ ink: 'neon' as never })]))).toEqual(EMPTY_SCENE);
		// SAFETY: likewise a kind the schema does not list, for the same reason.
		expect(parseScene(stored([element({ kind: 'hexagon' as never })]))).toEqual(EMPTY_SCENE);
	});

	it('cannot read NaN or Infinity back, because JSON cannot write them', () => {
		// Both serialize as `null`, which the schema rejects — so a board that
		// somehow held one opens empty instead of drawing nothing at NaN.
		expect(parseScene(stored([element({ x: Number.NaN })]))).toEqual(EMPTY_SCENE);
		expect(parseScene(stored([element({ w: Number.POSITIVE_INFINITY })]))).toEqual(EMPTY_SCENE);
	});

	it('fills in points and text so every element reads the same', () => {
		const raw = JSON.stringify({
			version: EMPTY_SCENE.version,
			elements: [{ id: 'e1', kind: 'rect', x: 0, y: 0, w: 1, h: 1, ink: 'ink', weight: 'thin' }]
		});
		expect(parseScene(raw).elements[0]).toMatchObject({ points: [], text: '', filled: false });
	});
});

describe('boundsOf', () => {
	it('reads a box drawn down and to the right', () => {
		expect(boundsOf(element({ x: 10, y: 20, w: 30, h: 40 }))).toEqual({
			x: 10,
			y: 20,
			w: 30,
			h: 40
		});
	});

	it('reads a box dragged up and to the left as the same box', () => {
		expect(boundsOf(element({ x: 40, y: 60, w: -30, h: -40 }))).toEqual({
			x: 10,
			y: 20,
			w: 30,
			h: 40
		});
	});
});

describe('boundsOfPoints', () => {
	it('takes the extent of a stroke', () => {
		const points: Point[] = [
			[5, 5],
			[-5, 10],
			[20, 0]
		];
		expect(boundsOfPoints(points)).toEqual({ x: -5, y: 0, w: 25, h: 10 });
	});

	it('answers a zero box for no points', () => {
		expect(boundsOfPoints([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
	});
});

describe('movedBy', () => {
	it('moves the box and leaves everything else alone', () => {
		const moved = movedBy(element({ x: 5, y: 5, points: [[1, 1]] }), 10, -5);
		expect(moved).toMatchObject({ x: 15, y: 0, w: 100, h: 50 });
		// Points ride along with the box rather than being rewritten.
		expect(moved.points).toEqual([[1, 1]]);
	});
});

describe('elementAt', () => {
	const tolerance = 6;

	it('finds a boxed shape anywhere inside it', () => {
		const rect = element({ x: 0, y: 0, w: 100, h: 50 });
		expect(elementAt([rect], 50, 25, tolerance)?.id).toBe('e1');
		expect(elementAt([rect], 200, 25, tolerance)).toBeNull();
	});

	it('finds a line only near it', () => {
		const line = element({ kind: 'line', x: 0, y: 0, w: 100, h: 0 });
		expect(elementAt([line], 50, 3, tolerance)?.id).toBe('e1');
		expect(elementAt([line], 50, 40, tolerance)).toBeNull();
	});

	it('does not find a line past its end', () => {
		const line = element({ kind: 'line', x: 0, y: 0, w: 100, h: 0 });
		expect(elementAt([line], 140, 0, tolerance)).toBeNull();
	});

	it('finds a stroke near any of its segments, in board space', () => {
		const stroke = element({
			kind: 'draw',
			x: 100,
			y: 100,
			w: 20,
			h: 20,
			points: [
				[0, 0],
				[20, 20]
			]
		});
		expect(elementAt([stroke], 110, 110, tolerance)?.id).toBe('e1');
		expect(elementAt([stroke], 10, 10, tolerance)).toBeNull();
	});

	it('finds a stroke that never moved', () => {
		const dot = element({ kind: 'draw', x: 5, y: 5, w: 0, h: 0, points: [[0, 0]] });
		expect(elementAt([dot], 6, 6, tolerance)?.id).toBe('e1');
		expect(elementAt([dot], 40, 40, tolerance)).toBeNull();
	});

	it('picks the topmost of two that overlap', () => {
		const under = element({ id: 'under' });
		const over = element({ id: 'over' });
		expect(elementAt([under, over], 10, 10, tolerance)?.id).toBe('over');
	});
});

describe('thinPoints', () => {
	it('drops points closer together than the pointer needed to report them', () => {
		const points: Point[] = [
			[0, 0],
			[0, 0.5],
			[0, 1],
			[0, 10]
		];
		expect(thinPoints(points, 2)).toEqual([
			[0, 0],
			[0, 10]
		]);
	});

	it('keeps points that are far enough apart', () => {
		const points: Point[] = [
			[0, 0],
			[0, 10],
			[0, 20]
		];
		expect(thinPoints(points, 2)).toEqual(points);
	});

	it('always keeps where the stroke started and ended', () => {
		const points: Point[] = [
			[0, 0],
			[0, 0.1],
			[0, 0.2]
		];
		expect(thinPoints(points, 5)).toEqual([
			[0, 0],
			[0, 0.2]
		]);
	});

	it('leaves a stroke of one or two points alone', () => {
		expect(thinPoints([[1, 1]], 5)).toEqual([[1, 1]]);
		expect(
			thinPoints(
				[
					[1, 1],
					[1, 2]
				],
				5
			)
		).toEqual([
			[1, 1],
			[1, 2]
		]);
	});
});
