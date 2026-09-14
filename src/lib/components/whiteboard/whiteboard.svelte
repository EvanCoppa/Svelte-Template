<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { theme } from '$lib/theme.svelte';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import {
		boundsOf,
		boundsOfPoints,
		elementAt,
		FILL_ALPHA,
		INK_TOKENS,
		INKS,
		movedBy,
		TEXT_SIZE,
		thinPoints,
		WEIGHT_WIDTHS,
		type Ink,
		type Point,
		type Tool,
		type WhiteboardElement,
		type Weight
	} from '$lib/whiteboard/scene';

	/**
	 * The canvas: the one surface a board is drawn on, and the only part of
	 * the whiteboard that knows a pointer from a keystroke.
	 *
	 * **The page owns the drawing.** Every finished gesture leaves here as one
	 * element through `oncommit` — a shape that was just drawn, a shape that
	 * was just moved, a label that was just worded — and the page hands it to
	 * the board store, which is what puts it in `localStorage` and in history.
	 * A gesture still under the pointer is this component's alone: a rectangle
	 * being dragged out has no id, no history and nothing stored, because it
	 * is not yet a thing on the board. That split is what makes undo mean one
	 * gesture and keeps a thousand pointer events out of storage.
	 *
	 * `view` is where the reader is looking — pan and zoom — and is bindable
	 * so the page can show it and put it back. Everything in `scene.ts` is in
	 * board units; this file is the only place they meet screen pixels, in
	 * `toBoard()` and `toScreen()`.
	 *
	 * Drawn with the `app.css` tokens each ink names, re-read when the theme
	 * flips, so a board sketched in the light theme reads in the dark one with
	 * nothing stored per theme.
	 */
	let {
		ref = $bindable(null),
		class: className,
		elements,
		tool,
		ink,
		weight,
		filled,
		selectedId = null,
		view = $bindable({ x: 0, y: 0, k: 1 }),
		oncommit,
		onpick,
		ondelete,
		...restProps
	}: WithElementRef<Omit<HTMLAttributes<HTMLDivElement>, 'children'>> & {
		/** What is on the board, back to front. */
		elements: readonly WhiteboardElement[];
		/** What the pointer does next. */
		tool: Tool;
		/** What a new element is drawn in. */
		ink: Ink;
		weight: Weight;
		filled: boolean;
		/** The element wearing the selection ring, if any. */
		selectedId?: string | null;
		/** Where the reader is looking. Pan and zoom write to it. */
		view?: { x: number; y: number; k: number };
		/**
		 * A gesture finished: add this element, or replace the one with its id.
		 * Not named for the DOM event it resembles: the container is a div, and
		 * a div's own `onchange` and `onselect` already mean other things.
		 */
		oncommit: (element: WhiteboardElement) => void;
		/** The reader picked something up, or clicked empty board. */
		onpick: (id: string | null) => void;
		/** A label was emptied, which is how you delete one. */
		ondelete: (id: string) => void;
	} = $props();

	/** How far off a line the pointer may be and still catch it, in screen pixels. */
	const HIT_TOLERANCE = 8;
	/** Shorter than this and a drag was a click: nothing is drawn. */
	const MIN_DRAG = 4;
	/** A freehand point nearer than this to the last kept one is noise. */
	const MIN_POINT_DISTANCE = 2;
	const MIN_ZOOM = 0.2;
	const MAX_ZOOM = 5;
	/** The corner a rectangle is drawn with — the one nod to a sketch. */
	const CORNER = 6;
	/** An arrowhead's wings, in board units and radians. */
	const HEAD_LENGTH = 14;
	const HEAD_ANGLE = 0.45;
	/** A label's line box, as a multiple of its type size. */
	const LINE_HEIGHT = 1.3;

	/**
	 * A gesture in progress. Transient: none of it is on the board yet.
	 *
	 * Every point here is in board units, as everything in `scene.ts` is —
	 * except `pan`, which is the one gesture that moves the view rather than
	 * anything on the board, so it has to remember where the pointer went down
	 * in screen pixels and the view it started from.
	 */
	type Gesture =
		| { kind: 'drag'; from: Point; to: Point }
		| { kind: 'freehand'; points: Point[] }
		| { kind: 'move'; element: WhiteboardElement; from: Point; dx: number; dy: number }
		| { kind: 'pan'; from: Point; view: { x: number; y: number } };

	/**
	 * Deliberately NOT `$state`: nothing renders a gesture — only `draw()` reads
	 * it, from a frame callback — and every handler that touches one already
	 * asks for a redraw. Reactive state here would wrap each of a stroke's
	 * hundreds of points in a proxy for no reader at all.
	 */
	let gesture: Gesture | null = null;

	/** The label being worded, and the element it replaces when there is one. */
	let editing = $state<{ element: WhiteboardElement | null; x: number; y: number } | null>(null);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);

	/**
	 * Measured against the canvas's own font, so the box stored for a label is
	 * the width it will actually be drawn at. Set by the attachment below.
	 */
	let measure: (text: string) => number = () => 0;

	const toBoard = (sx: number, sy: number): Point => [
		(sx - view.x) / view.k,
		(sy - view.y) / view.k
	];
	const toScreen = (bx: number, by: number): Point => [bx * view.k + view.x, by * view.k + view.y];

	const crosshair = $derived(tool !== 'select');

	// ── Drawing ──

	const canvasAttachment: Attachment<HTMLCanvasElement> = (canvas) => {
		const context2d = canvas.getContext('2d');
		if (!context2d) return;
		// Hoisted into the function declarations below, which do not carry the
		// narrowing above; a typed alias does.
		const context: CanvasRenderingContext2D = context2d;

		let width = 0;
		let height = 0;
		let frame = 0;
		let family = '';
		let colours = readColours();

		/** A token's colour as the browser resolved it, so the board matches the chrome. */
		function token(name: string): string {
			return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		}

		function readColours() {
			// SAFETY: seeded empty and then given every key of `Record<Ink, string>`
			// — the loop walks `INKS`, which is that record's complete key set — so
			// the record is total by the time anything can read it.
			const inks = {} as Record<Ink, string>;
			for (const name of INKS) inks[name] = token(INK_TOKENS[name]);
			return { inks, ring: token('--primary') };
		}

		function fontOf(size: number): string {
			if (!family) family = getComputedStyle(canvas).fontFamily || 'system-ui, sans-serif';
			return `${size}px ${family}`;
		}

		measure = (text: string) => {
			context.font = fontOf(TEXT_SIZE);
			return context.measureText(text).width;
		};

		function requestDraw(): void {
			frame ||= requestAnimationFrame(draw);
		}

		function draw(): void {
			frame = 0;
			const dpr = window.devicePixelRatio || 1;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, width, height);

			context.save();
			context.translate(view.x, view.y);
			context.scale(view.k, view.k);
			context.lineCap = 'round';
			context.lineJoin = 'round';

			const moving = gesture?.kind === 'move' ? gesture : null;
			for (const element of elements) {
				// The one being dragged is drawn where the pointer has it, not
				// where the board still says it is.
				const shown =
					moving && moving.element.id === element.id
						? movedBy(element, moving.dx, moving.dy)
						: element;
				drawElement(shown);
				if (shown.id === selectedId) drawSelection(shown);
			}

			const preview = previewOf();
			if (preview) drawElement(preview);

			context.restore();
		}

		function drawElement(element: WhiteboardElement): void {
			const colour = colours.inks[element.ink];
			context.strokeStyle = colour;
			context.fillStyle = colour;
			context.lineWidth = WEIGHT_WIDTHS[element.weight];
			const box = boundsOf(element);

			switch (element.kind) {
				case 'rect': {
					context.beginPath();
					context.roundRect(box.x, box.y, box.w, box.h, CORNER);
					paint(element.filled);
					break;
				}
				case 'ellipse': {
					context.beginPath();
					context.ellipse(
						box.x + box.w / 2,
						box.y + box.h / 2,
						box.w / 2,
						box.h / 2,
						0,
						0,
						Math.PI * 2
					);
					paint(element.filled);
					break;
				}
				case 'line':
				case 'arrow': {
					const [x2, y2] = [element.x + element.w, element.y + element.h];
					context.beginPath();
					context.moveTo(element.x, element.y);
					context.lineTo(x2, y2);
					context.stroke();
					if (element.kind === 'arrow') drawHead(element.x, element.y, x2, y2);
					break;
				}
				case 'draw': {
					const [first, ...rest] = element.points;
					if (!first) break;
					context.beginPath();
					context.moveTo(element.x + first[0], element.y + first[1]);
					for (const [px, py] of rest) context.lineTo(element.x + px, element.y + py);
					// A tap with the pencil is a dot, and a path of one point strokes nothing.
					if (rest.length === 0) context.lineTo(element.x + first[0], element.y + first[1]);
					context.stroke();
					break;
				}
				case 'text': {
					context.font = fontOf(TEXT_SIZE);
					context.textBaseline = 'top';
					context.fillText(element.text, element.x, element.y);
					break;
				}
			}
		}

		/** Wash a shape in its own ink, then outline it. */
		function paint(wash: boolean): void {
			if (wash) {
				context.globalAlpha = FILL_ALPHA;
				context.fill();
				context.globalAlpha = 1;
			}
			context.stroke();
		}

		function drawHead(x1: number, y1: number, x2: number, y2: number): void {
			const angle = Math.atan2(y2 - y1, x2 - x1);
			context.beginPath();
			for (const wing of [angle - HEAD_ANGLE, angle + HEAD_ANGLE]) {
				context.moveTo(x2, y2);
				context.lineTo(x2 - Math.cos(wing) * HEAD_LENGTH, y2 - Math.sin(wing) * HEAD_LENGTH);
			}
			context.stroke();
		}

		/** The ring around what is picked up — dashed in screen pixels at any zoom. */
		function drawSelection(element: WhiteboardElement): void {
			const box = boundsOf(element);
			const pad = 6 / view.k;
			context.save();
			context.strokeStyle = colours.ring;
			context.lineWidth = 1.5 / view.k;
			context.setLineDash([4 / view.k, 3 / view.k]);
			context.strokeRect(
				box.x - pad,
				box.y - pad,
				box.w + pad * 2,
				(element.kind === 'text' ? TEXT_SIZE * LINE_HEIGHT : box.h) + pad * 2
			);
			context.restore();
		}

		// ── The pointer ──

		function pointOf(event: PointerEvent): Point {
			return toBoard(event.offsetX, event.offsetY);
		}

		function onPointerDown(event: PointerEvent): void {
			// A label being worded is committed by clicking away from it, exactly
			// as it is by tabbing away.
			if (editing) commitText();
			canvas.setPointerCapture(event.pointerId);
			const point = pointOf(event);

			// The middle button pans whatever the tool is — the one gesture that
			// never draws.
			if (event.button === 1) {
				gesture = { kind: 'pan', from: [event.offsetX, event.offsetY], view: { ...view } };
				return;
			}
			if (event.button !== 0) return;

			if (tool === 'text') {
				editing = { element: null, x: point[0], y: point[1] };
				draft = '';
				return;
			}

			if (tool === 'select') {
				const hit = elementAt(elements, point[0], point[1], HIT_TOLERANCE / view.k);
				onpick(hit?.id ?? null);
				gesture = hit
					? { kind: 'move', element: hit, from: point, dx: 0, dy: 0 }
					: // Empty board under the select tool is the pan surface.
						{ kind: 'pan', from: [event.offsetX, event.offsetY], view: { ...view } };
				return;
			}

			gesture =
				tool === 'draw'
					? { kind: 'freehand', points: [point] }
					: { kind: 'drag', from: point, to: point };
		}

		function onPointerMove(event: PointerEvent): void {
			const current = gesture;
			if (!current) return;

			switch (current.kind) {
				case 'pan':
					view.x = current.view.x + (event.offsetX - current.from[0]);
					view.y = current.view.y + (event.offsetY - current.from[1]);
					break;
				case 'move': {
					const point = pointOf(event);
					current.dx = point[0] - current.from[0];
					current.dy = point[1] - current.from[1];
					break;
				}
				case 'drag':
					current.to = pointOf(event);
					break;
				case 'freehand':
					current.points.push(pointOf(event));
					break;
			}
			requestDraw();
		}

		function onPointerUp(): void {
			const current = gesture;
			gesture = null;
			if (!current) return;

			switch (current.kind) {
				case 'pan':
					break;
				case 'move': {
					if (current.dx === 0 && current.dy === 0) break;
					oncommit(movedBy(current.element, current.dx, current.dy));
					break;
				}
				case 'drag': {
					const element = elementFrom(current.from, current.to);
					if (element) {
						oncommit(element);
						onpick(element.id);
					}
					break;
				}
				case 'freehand': {
					const element = strokeFrom(current.points);
					if (element) oncommit(element);
					break;
				}
			}
			requestDraw();
		}

		function onWheel(event: WheelEvent): void {
			event.preventDefault();
			// The trackpad pinch and ⌘/ctrl+wheel zoom about the pointer; a plain
			// wheel scrolls the board, which is what it does everywhere else.
			if (event.ctrlKey || event.metaKey) {
				const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * Math.exp(-event.deltaY / 200)));
				const ratio = next / view.k;
				view.x = event.offsetX - (event.offsetX - view.x) * ratio;
				view.y = event.offsetY - (event.offsetY - view.y) * ratio;
				view.k = next;
			} else {
				view.x -= event.deltaX;
				view.y -= event.deltaY;
			}
			requestDraw();
		}

		/** Size the canvas to its box at device resolution. */
		function resize(): void {
			const box = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			width = Math.round(box.width);
			height = Math.round(box.height);
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			requestDraw();
		}

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerUp);
		canvas.addEventListener('wheel', onWheel, { passive: false });

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		// The board changed, the selection moved, or the reader panned: redraw.
		$effect(() => {
			void elements;
			void selectedId;
			void view.x;
			void view.y;
			void view.k;
			requestDraw();
		});

		// The theme flipped: the same board in the other set of tokens.
		$effect(() => {
			void theme.current;
			colours = readColours();
			requestDraw();
		});

		return () => {
			if (frame) cancelAnimationFrame(frame);
			observer.disconnect();
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerUp);
			canvas.removeEventListener('wheel', onWheel);
		};
	};

	// ── What a gesture becomes ──

	/** The element a drag is drawing, or null while it is still a click. */
	function elementFrom(from: Point, to: Point): WhiteboardElement | null {
		if (tool === 'select' || tool === 'draw' || tool === 'text') return null;
		const [w, h] = [to[0] - from[0], to[1] - from[1]];
		if (Math.hypot(w * view.k, h * view.k) < MIN_DRAG) return null;
		return {
			id: crypto.randomUUID(),
			kind: tool,
			x: from[0],
			y: from[1],
			w,
			h,
			ink,
			weight,
			filled,
			points: [],
			text: ''
		};
	}

	/** A freehand stroke, thinned and stored against its own box. */
	function strokeFrom(points: readonly Point[]): WhiteboardElement | null {
		const kept = thinPoints(points, MIN_POINT_DISTANCE / view.k);
		const box = boundsOfPoints(kept);
		return kept.length === 0
			? null
			: {
					id: crypto.randomUUID(),
					kind: 'draw',
					x: box.x,
					y: box.y,
					w: box.w,
					h: box.h,
					ink,
					weight,
					filled: false,
					points: kept.map(([px, py]) => [px - box.x, py - box.y]),
					text: ''
				};
	}

	/** The gesture as an element to draw, so what you see is what you will get. */
	function previewOf(): WhiteboardElement | null {
		const current = gesture;
		if (current?.kind === 'drag') return elementFrom(current.from, current.to);
		if (current?.kind === 'freehand') return strokeFrom(current.points);
		return null;
	}

	// ── Labels ──

	/**
	 * Word a label: a new one where the text tool was clicked, or the one that
	 * was double-clicked, in its own ink rather than the palette's current.
	 */
	function edit(element: WhiteboardElement): void {
		editing = { element, x: element.x, y: element.y };
		draft = element.text;
	}

	function onDoubleClick(event: MouseEvent): void {
		if (tool !== 'select') return;
		const [bx, by] = toBoard(event.offsetX, event.offsetY);
		const hit = elementAt(elements, bx, by, HIT_TOLERANCE / view.k);
		if (hit?.kind === 'text') edit(hit);
	}

	/** Enter or a click away keeps it; an emptied label is a deleted one. */
	function commitText(): void {
		const open = editing;
		editing = null;
		if (!open) return;

		const text = draft.trim();
		const existing = open.element;
		if (text.length === 0) {
			if (existing) ondelete(existing.id);
			return;
		}

		oncommit({
			id: existing?.id ?? crypto.randomUUID(),
			kind: 'text',
			x: open.x,
			y: open.y,
			w: measure(text),
			h: TEXT_SIZE * LINE_HEIGHT,
			// A label already on the board keeps how it was drawn; a new one
			// takes what the palette is set to.
			ink: existing?.ink ?? ink,
			weight: existing?.weight ?? weight,
			filled: false,
			points: [],
			text
		});
	}

	function onDraftKeydown(event: KeyboardEvent): void {
		// The board's own shortcuts are not typing: keep them off the window
		// while a label is open.
		event.stopPropagation();
		if (event.key === 'Enter') {
			event.preventDefault();
			commitText();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			editing = null;
		}
	}

	// The input is drawn only once there is something to word, so focus it as
	// soon as it exists rather than on a timer.
	$effect(() => {
		if (editing) input?.focus();
	});

	const labels = $derived(elements.filter((element) => element.kind === 'text'));

	/** What is on the board, in words, for the mirror below the canvas. */
	const summary = $derived(
		elements.length === 1 ? '1 element on the board' : `${elements.length} elements on the board`
	);
</script>

<div
	bind:this={ref}
	data-slot="whiteboard"
	class={cn('bg-card relative min-h-64 w-full overflow-hidden rounded-lg border', className)}
	{...restProps}
>
	<!-- A canvas is a picture: the board it draws is mirrored as text at the
	     foot of this component for anything that cannot use a pointer. The
	     pointer itself is bound inside the attachment rather than here, so
	     every gesture is set up and torn down in one place. -->
	<canvas
		class={cn('block size-full touch-none', crosshair ? 'cursor-crosshair' : 'cursor-default')}
		ondblclick={onDoubleClick}
		{@attach canvasAttachment}
	></canvas>

	{#if editing}
		{@const [left, top] = toScreen(editing.x, editing.y)}
		<!-- Worded in place, at the size and in the ink it will be drawn in, so
		     a label does not move when it stops being an input. -->
		<input
			bind:this={input}
			bind:value={draft}
			onkeydown={onDraftKeydown}
			onblur={commitText}
			aria-label="Label text"
			class="absolute border-none bg-transparent p-0 outline-none"
			style:left="{left}px"
			style:top="{top}px"
			style:color="var({INK_TOKENS[editing.element?.ink ?? ink]})"
			style:font-size="{TEXT_SIZE * view.k}px"
			style:line-height={LINE_HEIGHT}
		/>
	{/if}

	<!-- The board as text, the way the relationship graph mirrors its map: a
	     canvas takes no role of its own, so the region carries the name the page
	     gave it and the drawing is described in here. Deliberately not a live
	     region — announcing the count on every stroke would narrate the drawing
	     rather than describe it. A label is the only part of a drawing that has
	     words, and it is what a board is usually annotated with. -->
	<div class="sr-only">
		{summary}
		{#if labels.length > 0}
			<ul>
				{#each labels as label (label.id)}
					<li>{label.text}</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
