/**
 * Which names the map draws — the decluttering pass, and the one thing
 * between a readable graph and a wall of overlapping type.
 *
 * The rule every dense map settles on is the same: **draw as many names as
 * fit, and no more.** Each name asks for a box in screen pixels; the boxes
 * are offered in priority order, each trying a few anchors around its dot
 * before giving up, and a name that would land on a box already taken is
 * not drawn at all. So the map names its hubs zoomed out and everything
 * zoomed in, with nothing overlapping at either end.
 *
 * Two rules come with it:
 *
 * - **A name is earned by zoom and by degree together** (`namesAt()`). A
 *   road atlas prints the cities at every scale and the villages only on
 *   the town plan; a record with fifty relationships is this map's city.
 *   One threshold covers every zoom, so there is no level at which the map
 *   is a hairball of type and none at which it is a field of anonymous
 *   dots.
 * - **A name that does not fit where it wants tries elsewhere first**
 *   (`ANCHORS`) — below its dot, then above, then to either side — so a
 *   crowded patch loses far fewer names than one fixed position would.
 *
 * Screen pixels throughout, never map units: overlap is something that
 * happens on the reader's screen, and a box that clears at one zoom fouls
 * at another. Everything here is pure and tested on its own; the component
 * measures the text and does the drawing.
 */

/** A rectangle in screen pixels, from its top-left corner. */
export type Box = { x: number; y: number; width: number; height: number };

/** Where a name sits relative to its dot, in the order a name tries them. */
export const ANCHORS = ['below', 'above', 'right', 'left'] as const;

export type Anchor = (typeof ANCHORS)[number];

/** One name asking for room on the map. */
export type LabelRequest = {
	/** The node or edge the name belongs to — echoed back on the placement. */
	id: string;
	/** The dot's centre in screen pixels (an edge's name asks about its midpoint). */
	x: number;
	y: number;
	/** The dot's radius in screen pixels; the name sits clear of it. */
	radius: number;
	/** The measured text, and the line it needs. */
	width: number;
	height: number;
	/** Higher wins a collision. */
	priority: number;
	/**
	 * Drawn whatever it covers, and it takes its box: the record under the
	 * pointer is never the one the map decides to leave out.
	 */
	required?: boolean;
};

/** Where a name is drawn: the left edge of the text, on its middle line. */
export type Placement = { id: string; x: number; y: number; anchor: Anchor };

export type PlaceOptions = {
	/** The canvas, in screen pixels — a name is drawn only where it fits whole. */
	width: number;
	height: number;
	/** Clear space between a name and its own dot. */
	gap?: number;
	/** Breathing room around a name when it is tested against its neighbours. */
	padding?: number;
};

/** The grid the taken boxes are bucketed into, so a name tests its neighbours, not the map. */
const CELL = 64;

/** Room between a name and the dot it names. */
const GAP = 4;

/**
 * Breathing room around a name in the collision test only — never drawn.
 * Two names that merely miss each other still read as one word; a little
 * slack around every box is what keeps them apart.
 */
const PADDING = 3;

/**
 * How much zoom × standing a record needs before the map prints its name at
 * all. Below it the map is a shape rather than a list: a record in no
 * relationship is named once the reader is about three quarters of the way
 * in, one with three from a third of the way, a hub with fifty from as far
 * out as the map goes. Past it the collision pass decides, which is where
 * most of the work happens — this only keeps the far view from becoming a
 * field of names nobody can attach to a dot.
 */
const NAME_THRESHOLD = 1.5;

/**
 * Whether the map is close enough to print this record's name, given how
 * many relationships it stands in. Zoom and standing trade off against each
 * other — the hub is named from across the map, the leaf when you reach it
 * — which is what gives the map a readable number of names at every zoom
 * without a threshold per level.
 */
export function namesAt(zoom: number, degree: number): boolean {
	return zoom * (2 + degree) >= NAME_THRESHOLD;
}

/** The box a name would take at one anchor. */
export function boxFor(request: LabelRequest, anchor: Anchor, gap = GAP): Box {
	const { x, y, radius, width, height } = request;
	switch (anchor) {
		case 'below':
			return { x: x - width / 2, y: y + radius + gap, width, height };
		case 'above':
			return { x: x - width / 2, y: y - radius - gap - height, width, height };
		case 'right':
			return { x: x + radius + gap, y: y - height / 2, width, height };
		case 'left':
			return { x: x - radius - gap - width, y: y - height / 2, width, height };
	}
}

/** Bucket key for a cell, as one number: no string per cell per frame. */
const keyOf = (cx: number, cy: number) => cx * 100_000 + cy;

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Run `visit` over every grid cell a box touches. */
function eachCell(box: Box, visit: (key: number) => void): void {
	const x0 = Math.floor(box.x / CELL);
	const x1 = Math.floor((box.x + box.width) / CELL);
	const y0 = Math.floor(box.y / CELL);
	const y1 = Math.floor((box.y + box.height) / CELL);
	for (let cx = x0; cx <= x1; cx += 1) {
		for (let cy = y0; cy <= y1; cy += 1) visit(keyOf(cx, cy));
	}
}

/**
 * The names that fit, in the order they should be drawn. A name is offered
 * its anchors in turn and takes the first that is wholly on screen and
 * clear of everything already placed; one that gets no anchor is left off
 * the map entirely, because half a name over another name is worse than
 * neither.
 *
 * Ties break on id so the same map draws the same way twice — a name that
 * flickered as the layout settled would read as a fault.
 */
export function placeLabels(requests: readonly LabelRequest[], options: PlaceOptions): Placement[] {
	const { width, height, gap = GAP, padding = PADDING } = options;
	const taken = new Map<number, Box[]>();
	const placed: Placement[] = [];

	const order = [...requests].sort(
		(a, b) =>
			Number(b.required ?? false) - Number(a.required ?? false) ||
			b.priority - a.priority ||
			(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);

	for (const request of order) {
		for (const anchor of ANCHORS) {
			const box = boxFor(request, anchor, gap);
			if (!request.required) {
				if (box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height) {
					continue;
				}
				const tested: Box = {
					x: box.x - padding,
					y: box.y - padding,
					width: box.width + padding * 2,
					height: box.height + padding * 2
				};
				let fouled = false;
				eachCell(tested, (key) => {
					if (fouled) return;
					for (const other of taken.get(key) ?? []) {
						if (overlaps(tested, other)) {
							fouled = true;
							return;
						}
					}
				});
				if (fouled) continue;
			}
			eachCell(box, (key) => {
				const bucket = taken.get(key);
				if (bucket) bucket.push(box);
				else taken.set(key, [box]);
			});
			placed.push({ id: request.id, x: box.x, y: box.y + box.height / 2, anchor });
			break;
		}
	}

	return placed;
}

/**
 * A name cut to fit, with an ellipsis. A practice called "Upper West Side
 * Oral And Maxillofacial Surgery" would otherwise ask for a box a third of
 * the map wide and lose its place to something with less to say.
 */
export function truncate(
	text: string,
	maxWidth: number,
	measure: (text: string) => number
): string {
	if (measure(text) <= maxWidth) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (measure(`${text.slice(0, mid).trimEnd()}…`) <= maxWidth) low = mid;
		else high = mid - 1;
	}
	return low > 0 ? `${text.slice(0, low).trimEnd()}…` : '…';
}
