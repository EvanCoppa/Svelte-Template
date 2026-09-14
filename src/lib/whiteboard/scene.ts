import { z } from 'zod';

/**
 * The whiteboard's scene: what is on the one canvas, and the pure geometry
 * every surface that touches it runs on.
 *
 * A scene is a flat, ordered list of elements — first drawn is furthest back
 * — and **every element is a box**: `(x, y)` with a `(w, h)` that may be
 * negative, because a box dragged up and to the left is still the box you
 * dragged. That is the one deliberate simplification here, and it is what
 * lets selecting, moving and hit-testing be one code path rather than six: a
 * rectangle's box is its outline, an ellipse's is what it is inscribed in, a
 * line's is the diagonal from one end to the other, a freehand stroke's is
 * the extent of its points and a label's is what the canvas measured its
 * text at. Nothing normalizes those signs — `boundsOf()` reads them when
 * something needs a corner and a size, and the canvas draws from them
 * directly.
 *
 * A freehand stroke's `points` are stored **relative to its box**, so
 * dragging the stroke is two numbers rather than a thousand.
 *
 * Client-safe and side-effect free: the store (`board.svelte.ts`) keeps a
 * scene in `localStorage` and the canvas draws one, and both ask this module
 * what is where. Sizes and positions are in **board units** — what the
 * reader has panned and zoomed away from — never screen pixels.
 */

/**
 * What an element can be, in the order the toolbar offers them. `kind` is the
 * word the rest of the app uses for "which sort of thing this row is"
 * (`RecordKind`, `products.kind`), and an element is no different.
 */
const ELEMENT_KINDS = ['rect', 'ellipse', 'arrow', 'line', 'draw', 'text'] as const;

/**
 * What the pointer does: pick things up, or draw one of the kinds. Select
 * first — a board you cannot rearrange is a picture.
 */
export const TOOLS = ['select', ...ELEMENT_KINDS] as const;

export type Tool = (typeof TOOLS)[number];

/**
 * The inks, in the order the palette offers them. Each is an `app.css`
 * token rather than a colour (`INK_TOKENS`), so a board drawn in the light
 * theme is legible in the dark one with nothing stored per theme — and `ink`
 * itself is the page's own foreground, which is to say "whatever the reader
 * reads everything else in".
 */
export const INKS = ['ink', 'red', 'amber', 'green', 'blue', 'violet'] as const;

export type Ink = (typeof INKS)[number];

/** The custom property each ink resolves to at draw time. */
export const INK_TOKENS = {
	ink: '--foreground',
	red: '--chart-7',
	amber: '--chart-5',
	green: '--chart-8',
	blue: '--chart-2',
	violet: '--chart-6'
} satisfies Record<Ink, string>;

/** How heavy a line is. Two, because a third is a preference nobody sets. */
export const WEIGHTS = ['thin', 'bold'] as const;

export type Weight = (typeof WEIGHTS)[number];

/** Each weight in board units. */
export const WEIGHT_WIDTHS = { thin: 2, bold: 4 } satisfies Record<Weight, number>;

/** The type size a label is drawn and measured at, in board units. */
export const TEXT_SIZE = 20;

/** How translucent a filled shape's wash is — its own ink, quietly. */
export const FILL_ALPHA = 0.18;

const pointSchema = z.tuple([z.number(), z.number()]);

/** One point of a freehand stroke, relative to its element's box. */
export type Point = z.infer<typeof pointSchema>;

/**
 * `points` and `text` carry a default rather than being optional: a shape
 * that has neither reads as an empty one, and every consumer gets the same
 * element type instead of narrowing a union on a field that may be absent.
 */
const elementSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(ELEMENT_KINDS),
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number(),
	ink: z.enum(INKS),
	weight: z.enum(WEIGHTS),
	/** Boxed kinds only: washed with its own ink, or an outline. */
	filled: z.boolean().default(false),
	/** `draw` only, relative to the box. */
	points: z.array(pointSchema).default([]),
	/** `text` only. */
	text: z.string().default('')
});

export type WhiteboardElement = z.infer<typeof elementSchema>;

/**
 * Bumped when a stored scene can no longer be read as one. The version is a
 * `literal`, so a board from an older build fails the parse and the reader
 * opens an empty canvas rather than a half-understood one — the same bargain
 * every device-axis value strikes (docs/user-preferences.md).
 */
const SCENE_VERSION = 1;

const sceneSchema = z.object({
	version: z.literal(SCENE_VERSION),
	elements: z.array(elementSchema)
});

export type Scene = z.infer<typeof sceneSchema>;

/** A board nobody has drawn on. */
export const EMPTY_SCENE: Scene = { version: SCENE_VERSION, elements: [] };

/**
 * A stored scene, or an empty one. Never throws and never half-reads: bad
 * JSON, a scene from a future build and a key some other program left behind
 * all arrive as the empty board.
 *
 * NaN and Infinity need no guard of their own — `JSON.stringify` writes both
 * as `null`, which is not a number, so neither can come back through here.
 */
export function parseScene(raw: string | null): Scene {
	if (raw === null) return EMPTY_SCENE;
	try {
		const parsed = sceneSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : EMPTY_SCENE;
	} catch {
		return EMPTY_SCENE;
	}
}

/** A corner and a size, both positive. */
export type Box = { x: number; y: number; w: number; h: number };

/** An element's box read as a corner and a size, whichever way it was drawn. */
export function boundsOf(element: WhiteboardElement): Box {
	return {
		x: Math.min(element.x, element.x + element.w),
		y: Math.min(element.y, element.y + element.h),
		w: Math.abs(element.w),
		h: Math.abs(element.h)
	};
}

/** The extent of a freehand stroke, so its points can be stored against it. */
export function boundsOfPoints(points: readonly Point[]): Box {
	const first = points[0];
	if (!first) return { x: 0, y: 0, w: 0, h: 0 };
	let [minX, minY] = first;
	let [maxX, maxY] = first;
	for (const [x, y] of points) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The same element, somewhere else. Its points ride along with its box. */
export function movedBy(element: WhiteboardElement, dx: number, dy: number): WhiteboardElement {
	return { ...element, x: element.x + dx, y: element.y + dy };
}

/**
 * The topmost element under a point, or null. Last drawn is nearest the
 * reader, so the search runs back to front — the order a click resolves in.
 *
 * `tolerance` is how far off a line the pointer may be and still have hit
 * it, in board units: a hairline is a few pixels wide and a pointer is not
 * that precise, so a line nobody can select is a line nobody can move.
 */
export function elementAt(
	elements: readonly WhiteboardElement[],
	x: number,
	y: number,
	tolerance: number
): WhiteboardElement | null {
	for (let i = elements.length - 1; i >= 0; i -= 1) {
		const element = elements[i];
		if (element && isHit(element, x, y, tolerance)) return element;
	}
	return null;
}

function isHit(element: WhiteboardElement, x: number, y: number, tolerance: number): boolean {
	if (element.kind === 'draw') {
		const { x: ox, y: oy, points } = element;
		for (let i = 1; i < points.length; i += 1) {
			const from = points[i - 1];
			const to = points[i];
			if (!from || !to) continue;
			const near =
				distanceToSegment(x, y, ox + from[0], oy + from[1], ox + to[0], oy + to[1]) <= tolerance;
			if (near) return true;
		}
		// A tap that never moved is one point and no segment; it is still a mark.
		const only = points.length === 1 ? points[0] : undefined;
		return only ? Math.hypot(x - (ox + only[0]), y - (oy + only[1])) <= tolerance : false;
	}

	if (element.kind === 'line' || element.kind === 'arrow') {
		const distance = distanceToSegment(
			x,
			y,
			element.x,
			element.y,
			element.x + element.w,
			element.y + element.h
		);
		return distance <= tolerance;
	}

	// A boxed kind is hit anywhere inside it, filled or not. Excalidraw asks for
	// the edge of an unfilled one; this board would rather be caught than
	// precise, since the alternative is a rectangle you have to trace to move.
	const box = boundsOf(element);
	return (
		x >= box.x - tolerance &&
		x <= box.x + box.w + tolerance &&
		y >= box.y - tolerance &&
		y <= box.y + box.h + tolerance
	);
}

/** How far a point lies off a segment — the whole of hit-testing a line. */
function distanceToSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	// A segment of no length is a point.
	if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
	// How far along the segment the perpendicular falls, clamped to its ends.
	const along = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
	return Math.hypot(px - (ax + along * dx), py - (ay + along * dy));
}

/**
 * A freehand stroke with its near-duplicate points dropped: a pointer
 * reports far more of them than a line needs, and every one is a number that
 * goes to `localStorage` and is re-read on every frame. The first and last
 * are always kept, so a stroke still starts and ends where the reader did.
 */
export function thinPoints(points: readonly Point[], minDistance: number): Point[] {
	const first = points[0];
	if (!first || points.length < 3) return [...points];

	const kept: Point[] = [first];
	let [lastX, lastY] = first;
	for (let i = 1; i < points.length - 1; i += 1) {
		const point = points[i];
		if (!point) continue;
		if (Math.hypot(point[0] - lastX, point[1] - lastY) < minDistance) continue;
		kept.push(point);
		[lastX, lastY] = point;
	}

	const last = points[points.length - 1];
	if (last) kept.push(last);
	return kept;
}
