<script lang="ts" module>
	export type LightboxSpringSpec = { stiffness: number; damping: number; mass: number };

	/** The zoom's own spring — snappy, for wheel and double-click landings. */
	const CELL: LightboxSpringSpec = { stiffness: 520, damping: 34, mass: 0.45 };
	/** The flight home: the opening arrival, the return, and every reset. */
	const HOME: LightboxSpringSpec = { stiffness: 150, damping: 27, mass: 1 };

	/** The veil behind the frame and the chrome floating over it. */
	const VEIL: LightboxSpringSpec = { stiffness: 260, damping: 34, mass: 0.8 };
	/** The zoom glyph swapping between plus and minus. */
	const GLYPH: LightboxSpringSpec = { stiffness: 700, damping: 46, mass: 0.5 };

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];

	/** Double-click and the chrome button toggle between fit and this. */
	const TOGGLE = 2.5;
	/** Multiplier per press of plus or minus. */
	const KEY_ZOOM = 1.6;
	/** Pixels an arrow key pans while zoomed. */
	const KEY_PAN = 56;
	/** Wheel delta that doubles the zoom, via exp. */
	const WHEEL_RATE = 140;
	/** Pointer travel that separates a dismissing tap from a pan. */
	const SLOP = 8;
	/** At or under this the viewer counts as unzoomed, so a tap dismisses. */
	const NEAR_HOME = 1.02;
	/** A release under this snaps back to exactly 1, never to 1.01. */
	const SNAP_HOME = 1.05;

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

	/** Where the image sits when it is not in the viewer: over its trigger, or just below centre. */
	type Landing = { dx: number; dy: number; s: number; o: number; r: number };

	type Drag = { id: number; from: { x: number; y: number }; x: number; y: number };
</script>

<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { animate } from 'motion';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	export interface LightboxProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** Whether the overlay is up. Bindable — without `onClose` the viewer closes itself. */
		open?: boolean;
		/** Fired by Escape, the close button, and a tap on the backdrop while unzoomed. */
		onClose?: () => void;
		/** Full-size image source. Keep it set through the close flight. */
		src: string;
		/** Names the image and, when no caption is given, labels the dialog. */
		alt: string;
		/** The element the image should return to — normally the thumbnail that was clicked. */
		origin?: HTMLElement | null;
		/** Label shown top-left and used as the dialog's accessible name. */
		caption?: string;
		/** Intrinsic pixel width. Reserves the image box before the file loads. */
		width?: number;
		/** Intrinsic pixel height, paired with width. */
		height?: number;
		/** Ceiling for wheel, double-click and keyboard zoom. Values at or below 1.1 are raised to 1.1. */
		maxScale?: number;
		/** Cells the zoom readout is quantised into, so the status is announced in whole steps. */
		steps?: number;
		/** Turns off every gesture. The chrome buttons still work. */
		disabled?: boolean;
		/** Portal target. Pass null to render nothing; defaults to document.body. */
		container?: HTMLElement | null;
	}

	let {
		class: className = '',
		open = $bindable(false),
		onClose,
		src,
		alt,
		origin = null,
		caption,
		width,
		height,
		maxScale = 4,
		steps = 8,
		disabled = false,
		container,
		...restProps
	}: LightboxProps = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const hintId = `${uid}-hint`;

	const cells = $derived(Math.max(1, Math.round(steps)));
	const top = $derived(Math.max(1.1, maxScale));

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const target = $derived(container === undefined ? (mounted ? document.body : null) : container);

	/** The overlay outlives `open` by one return flight. */
	let present = $state(false);
	let leaving = $state(false);

	let shellEl = $state<HTMLDivElement | null>(null);
	let frameEl = $state<HTMLDivElement | null>(null);
	let contentEl = $state<HTMLImageElement | null>(null);

	// The zoom: written straight to the node, so a drag never waits on a layout pass.
	let zs = $state(1);
	let zx = $state(0);
	let zy = $state(0);

	// The flight: the whole framed image travelling between the viewer and its trigger.
	let fx = $state(0);
	let fy = $state(0);
	let fs = $state(1);
	let fo = $state(0);
	let fr = $state(14);
	let blur = $state(0);
	let veil = $state(0);
	let chrome = $state(0);

	let step = $state(0);
	let settled = $state(0);

	const zoomed = $derived(step > 0);
	const settledZoom = $derived(1 + (settled / cells) * (top - 1));

	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	let drag: Drag | null = null;
	let onContent = false;

	let stopFlight: (() => void) | null = null;
	let stopZoom: (() => void) | null = null;
	/** The frame that hands the veil, the chrome and the blur their opening values. */
	let openFrame = 0;

	/**
	 * Runs a bare 0 -> 1 progress value on one of the springs above and hands each
	 * frame to `onFrame`. Everything the viewer moves — the frame, the veil, the
	 * zoom — is interpolated from that single number, so the whole composition
	 * travels on one spring instead of eight that could drift apart.
	 */
	function run(spec: LightboxSpringSpec, onFrame: (p: number) => void, onDone?: () => void) {
		const controls = animate(0, 1, {
			type: 'spring',
			...spec,
			onUpdate: onFrame,
			onComplete: onDone
		});
		return () => controls.stop();
	}

	/** The same, on a fixed duration, for the reduced-motion fade out. */
	function runLinear(seconds: number, onFrame: (p: number) => void, onDone?: () => void) {
		const controls = animate(0, 1, {
			duration: seconds,
			ease: 'linear',
			onUpdate: onFrame,
			onComplete: onDone
		});
		return () => controls.stop();
	}

	onDestroy(() => {
		stopFlight?.();
		stopZoom?.();
		if (openFrame) cancelAnimationFrame(openFrame);
		if (settleTimer) clearTimeout(settleTimer);
	});

	function requestClose() {
		if (onClose) {
			onClose();
			return;
		}
		open = false;
	}

	function toStep(s: number) {
		return clamp(Math.round(((s - 1) / (top - 1)) * cells), 0, cells);
	}

	function mark(s: number) {
		const next = toStep(s);
		if (step !== next) step = next;
	}

	function settleNow(s: number) {
		if (settleTimer) {
			clearTimeout(settleTimer);
			settleTimer = null;
		}
		const next = toStep(s);
		if (settled !== next) settled = next;
	}

	// The screen reader is told the level once the wheel has actually stopped.
	function settleSoon(s: number) {
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			settleTimer = null;
			settleNow(s);
		}, 220);
	}

	/** Pan is clamped against the image's own edges at every scale. */
	function limit(s: number) {
		const frame = frameEl;
		const content = contentEl;
		if (!frame || !content) return { mx: 0, my: 0 };
		return {
			mx: Math.max(0, (content.offsetWidth * s - frame.clientWidth) / 2),
			my: Math.max(0, (content.offsetHeight * s - frame.clientHeight) / 2)
		};
	}

	function place(s: number, nx: number, ny: number) {
		stopZoom?.();
		stopZoom = null;
		const { mx, my } = limit(s);
		zs = s;
		zx = clamp(nx, -mx, mx);
		zy = clamp(ny, -my, my);
		mark(s);
	}

	function glide(s: number, nx: number, ny: number, spec: LightboxSpringSpec = CELL) {
		const { mx, my } = limit(s);
		const tx = clamp(nx, -mx, mx);
		const ty = clamp(ny, -my, my);

		stopZoom?.();
		stopZoom = null;

		if (reducedMotion.current) {
			zs = s;
			zx = tx;
			zy = ty;
		} else {
			const from = { s: zs, x: zx, y: zy };
			stopZoom = run(spec, (k) => {
				zs = from.s + (s - from.s) * k;
				zx = from.x + (tx - from.x) * k;
				zy = from.y + (ty - from.y) * k;
			});
		}

		mark(s);
		settleNow(s);
	}

	function reset() {
		glide(1, 0, 0, HOME);
	}

	// The wheel zooms toward the cursor, so the detail under the pointer stays there.
	function zoomAt(next: number, cx: number, cy: number, animated: boolean) {
		const frame = frameEl;
		if (!frame) return;
		const r = frame.getBoundingClientRect();
		const px = cx - (r.left + r.width / 2);
		const py = cy - (r.top + r.height / 2);
		const s0 = zs;
		const ax = (px - zx) / s0;
		const ay = (py - zy) / s0;
		const s = clamp(next, 1, top);
		const nx = px - ax * s;
		const ny = py - ay * s;
		if (animated) {
			glide(s, nx, ny, s <= 1 ? HOME : CELL);
			return;
		}
		place(s, nx, ny);
		settleSoon(s);
	}

	function finish() {
		if (zs < SNAP_HOME) reset();
		else settleNow(zs);
	}

	function handlePointerDown(event: PointerEvent) {
		if (disabled) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// SAFETY: a pointer event's target dispatched within the frame is always a Node.
		onContent = contentEl ? contentEl.contains(event.target as Node) : false;
		// SAFETY: handlePointerDown is only ever bound as this viewer's own
		// onpointerdown handler, so currentTarget is the frame's HTMLElement.
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		drag = {
			id: event.pointerId,
			from: { x: event.clientX, y: event.clientY },
			x: zx,
			y: zy
		};
	}

	function handlePointerMove(event: PointerEvent) {
		const held = drag;
		if (!held || held.id !== event.pointerId) return;
		if (zs <= 1) return;
		place(zs, held.x + (event.clientX - held.from.x), held.y + (event.clientY - held.from.y));
	}

	function handlePointerUp(event: PointerEvent) {
		const held = drag;
		if (!held || held.id !== event.pointerId) return;
		drag = null;
		const moved = Math.hypot(event.clientX - held.from.x, event.clientY - held.from.y);
		if (moved < SLOP && !onContent && zs <= NEAR_HOME) {
			requestClose();
			return;
		}
		finish();
	}

	function handlePointerCancel(event: PointerEvent) {
		const held = drag;
		if (!held || held.id !== event.pointerId) return;
		drag = null;
		finish();
	}

	function handleDoubleClick(event: MouseEvent) {
		if (disabled) return;
		zoomAt(zs > SNAP_HOME ? 1 : Math.min(TOGGLE, top), event.clientX, event.clientY, true);
	}

	function handleFrameKeyDown(event: KeyboardEvent) {
		const frame = frameEl;
		if (!frame || disabled) return;
		const r = frame.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		const s0 = zs;

		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			zoomAt(s0 * KEY_ZOOM, cx, cy, true);
			return;
		}
		if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			zoomAt(s0 / KEY_ZOOM, cx, cy, true);
			return;
		}
		if (event.key === '0') {
			event.preventDefault();
			reset();
			return;
		}
		if (s0 > NEAR_HOME && event.key.startsWith('Arrow')) {
			event.preventDefault();
			const dx = event.key === 'ArrowLeft' ? KEY_PAN : event.key === 'ArrowRight' ? -KEY_PAN : 0;
			const dy = event.key === 'ArrowUp' ? KEY_PAN : event.key === 'ArrowDown' ? -KEY_PAN : 0;
			glide(s0, zx + dx, zy + dy);
		}
	}

	// The wheel is non-passive, so it can be taken away from the page behind.
	function wheelZoom(el: HTMLElement) {
		const onWheel = (event: WheelEvent) => {
			if (disabled) return;
			event.preventDefault();
			zoomAt(zs * Math.exp(-event.deltaY / WHEEL_RATE), event.clientX, event.clientY, false);
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	}

	function portalTo(host: HTMLElement) {
		return (node: Element) => {
			host.appendChild(node);
		};
	}

	function toggleZoom() {
		const frame = frameEl;
		if (!frame) return;
		if (zoomed) {
			reset();
			return;
		}
		const r = frame.getBoundingClientRect();
		zoomAt(
			Math.min(TOGGLE, Math.max(1.1, maxScale)),
			r.left + r.width / 2,
			r.top + r.height / 2,
			true
		);
	}

	// Measured every time it is needed, never cached, so a scroll or a reflow
	// behind the overlay cannot make the image land beside its thumbnail.
	function landing(): Landing {
		const frame = frameEl;
		const content = contentEl;
		if (frame && content && origin && content.offsetWidth > 0) {
			const r = frame.getBoundingClientRect();
			const o = origin.getBoundingClientRect();
			if (o.width > 0) {
				const s = o.width / content.offsetWidth;
				const radius = Number.parseFloat(getComputedStyle(origin).borderTopLeftRadius) || 9;
				return {
					dx: o.left + o.width / 2 - (r.left + r.width / 2),
					dy: o.top + o.height / 2 - (r.top + r.height / 2),
					s,
					o: 1,
					r: radius / s
				};
			}
		}
		return { dx: 0, dy: 10, s: 0.97, o: 0, r: 14 };
	}

	function enter() {
		stopFlight?.();
		stopFlight = null;

		if (reducedMotion.current) {
			fx = 0;
			fy = 0;
			fs = 1;
			fo = 1;
			fr = 14;
			blur = 0;
			veil = 1;
			chrome = 1;
			return;
		}

		const d = landing();
		fx = d.dx;
		fy = d.dy;
		fs = d.s;
		fo = d.o;
		fr = d.r;
		blur = 6;

		const from = { ...d };
		stopFlight = run(HOME, (k) => {
			fx = from.dx * (1 - k);
			fy = from.dy * (1 - k);
			fs = from.s + (1 - from.s) * k;
			fo = from.o + (1 - from.o) * k;
			fr = from.r + (14 - from.r) * k;
		});

		// The veil, the chrome and the blur leave their opening values on the next
		// frame, so their CSS transitions have something to travel from.
		if (openFrame) cancelAnimationFrame(openFrame);
		openFrame = requestAnimationFrame(() => {
			openFrame = 0;
			if (leaving) return;
			veil = 1;
			chrome = 1;
			blur = 0;
		});
	}

	function settleClosed() {
		present = false;
		leaving = false;
		stopFlight = null;
		if (openFrame) {
			cancelAnimationFrame(openFrame);
			openFrame = 0;
		}
		stopZoom?.();
		stopZoom = null;
		if (settleTimer) {
			clearTimeout(settleTimer);
			settleTimer = null;
		}
		drag = null;
		zs = 1;
		zx = 0;
		zy = 0;
		step = 0;
		settled = 0;
		fx = 0;
		fy = 0;
		fs = 1;
		fo = 0;
		fr = 14;
		blur = 0;
		veil = 0;
		chrome = 0;
	}

	function exit() {
		leaving = true;
		veil = 0;
		chrome = 0;
		stopFlight?.();

		if (reducedMotion.current) {
			const from = fo;
			stopFlight = runLinear(
				0.12,
				(p) => {
					fo = from * (1 - p);
				},
				settleClosed
			);
			return;
		}

		// The zoom unwinds while the frame flies back to the rect the trigger
		// occupies right now, not the one it occupied when the viewer opened.
		const d = landing();
		const zoom = { s: zs, x: zx, y: zy };
		const from = { x: fx, y: fy, s: fs, o: fo, r: fr };
		blur = 4;

		stopZoom?.();
		stopZoom = null;

		stopFlight = run(
			HOME,
			(k) => {
				fx = from.x + (d.dx - from.x) * k;
				fy = from.y + (d.dy - from.y) * k;
				fs = from.s + (d.s - from.s) * k;
				fo = from.o + (d.o - from.o) * k;
				fr = from.r + (d.r - from.r) * k;
				zs = zoom.s + (1 - zoom.s) * k;
				zx = zoom.x * (1 - k);
				zy = zoom.y * (1 - k);
			},
			settleClosed
		);
	}

	// `open` drives presence, but the overlay only leaves once the flight is done.
	let shown = false;
	$effect(() => {
		const next = open;
		if (next === shown) return;
		shown = next;
		untrack(() => {
			if (next) {
				stopFlight?.();
				stopFlight = null;
				leaving = false;
				present = true;
			} else if (present) {
				exit();
			}
		});
	});

	// The opening flight waits for the nodes it has to measure.
	$effect(() => {
		if (!present || leaving) return;
		const frame = frameEl;
		const content = contentEl;
		if (!frame || !content) return;
		untrack(enter);
	});

	// Focus is taken on arrival and handed back when the overlay finally leaves,
	// and the page underneath keeps its scroll position and its width.
	$effect(() => {
		if (!present) return;
		const frame = frameEl;
		if (!frame) return;

		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const body = document.body;
		const overflow = body.style.overflow;
		const padding = body.style.paddingRight;
		const gap = window.innerWidth - document.documentElement.clientWidth;
		const base = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;

		body.style.overflow = 'hidden';
		if (gap > 0) body.style.paddingRight = `${base + gap}px`;
		frame.focus({ preventScroll: true });

		return () => {
			body.style.overflow = overflow;
			body.style.paddingRight = padding;
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	});

	// Tab cycles the viewer's own controls; Escape unwinds the zoom before it closes.
	function handleShellKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (zoomed) {
				reset();
				return;
			}
			requestClose();
			return;
		}
		if (event.key !== 'Tab') return;

		const shell = shellEl;
		if (!shell) return;
		const nodes = Array.from(shell.querySelectorAll<HTMLElement>('[data-lightbox-focus="1"]'));
		if (nodes.length === 0) return;

		event.preventDefault();
		const here =
			document.activeElement instanceof HTMLElement ? nodes.indexOf(document.activeElement) : -1;
		const next = event.shiftKey
			? here <= 0
				? nodes.length - 1
				: here - 1
			: here === -1 || here === nodes.length - 1
				? 0
				: here + 1;
		nodes[next]?.focus();
	}

	function abandon() {
		drag = null;
	}

	const CHROME_BUTTON =
		'grid size-8 cursor-pointer place-items-center rounded-[9px] border border-border bg-card text-muted-foreground outline-none transition-[border-color,color,box-shadow] duration-150 hover:text-foreground focus-visible:border-ring focus-visible:shadow-[0_1px_2px_rgba(28,25,23,0.08),0_10px_20px_-14px_rgba(28,25,23,0.6)]';
</script>

<svelte:window onblur={abandon} />

{#if present && target}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		{...restProps}
		bind:this={shellEl}
		{@attach portalTo(target)}
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		onkeydown={handleShellKeyDown}
		class={cn('fixed inset-0 z-50', className)}
	>
		<div
			aria-hidden="true"
			class="absolute inset-0 bg-black/80"
			{@attach motionTo(() => ({
				keyframes: { opacity: veil },
				transition: leaving ? { duration: 0.3, ease: EASE } : { type: 'spring', ...VEIL }
			}))}
		></div>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={frameEl}
			{@attach wheelZoom}
			data-lightbox-focus="1"
			tabindex="-1"
			role="group"
			aria-labelledby={titleId}
			aria-describedby={hintId}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerCancel}
			onlostpointercapture={handlePointerCancel}
			ondblclick={handleDoubleClick}
			onkeydown={handleFrameKeyDown}
			class={[
				'lightbox-frame absolute inset-0 overflow-hidden outline-none select-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]',
				zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
			]}
		>
			<div
				style:transform="translate3d({fx}px, {fy}px, 0) scale({fs})"
				style:opacity={fo}
				class="absolute inset-0 flex items-center justify-center p-4 sm:p-14"
				{@attach motionTo(() => ({
					keyframes: { filter: `blur(${blur}px)` },
					transition: { duration: leaving ? 0.64 : 0.35, ease: EASE }
				}))}
			>
				<img
					bind:this={contentEl}
					{src}
					{alt}
					{width}
					{height}
					draggable="false"
					style:transform="translate3d({zx}px, {zy}px, 0) scale({zs})"
					style:border-radius="{fr}px"
					class="max-h-full max-w-full object-contain"
				/>
			</div>
		</div>

		<div
			class="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-3 sm:p-4"
			{@attach motionTo(() => ({
				keyframes: { opacity: chrome },
				transition: leaving ? { duration: 0.2, ease: LEAVE } : { type: 'spring', ...VEIL }
			}))}
		>
			<p
				id={titleId}
				class="border-border bg-card text-foreground pointer-events-auto max-w-[65%] truncate rounded-[9px] border px-2.5 py-1.5 text-[12.5px]"
			>
				{caption ?? alt}
			</p>

			<div class="pointer-events-auto flex items-center gap-2">
				<button
					data-lightbox-focus="1"
					type="button"
					onclick={toggleZoom}
					aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
					class={CHROME_BUTTON}
				>
					<svg
						viewBox="0 0 256 256"
						class="size-[15px]"
						fill="none"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="116" cy="116" r="84" />
						<path d="M175.4 175.4 224 224M84 116h64" />
						<path
							d="M116 84v64"
							{@attach motionTo(() => ({
								keyframes: { opacity: zoomed ? 0 : 1 },
								transition: { type: 'spring', ...GLYPH }
							}))}
						/>
					</svg>
				</button>
				<button
					data-lightbox-focus="1"
					type="button"
					onclick={requestClose}
					aria-label="Close"
					class={CHROME_BUTTON}
				>
					<svg
						viewBox="0 0 256 256"
						class="size-[15px]"
						fill="none"
						stroke="currentColor"
						stroke-width="16"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M200 56 56 200M200 200 56 56" />
					</svg>
				</button>
			</div>
		</div>

		<p id={hintId} class="sr-only">
			Scroll to zoom toward the pointer, or press plus and minus. Drag or use the arrow keys to pan,
			and double-click to switch between fit and close-up. Press zero to return to the starting
			frame; Escape returns home first, then closes.
		</p>
		<p role="status" class="sr-only">Zoom {settledZoom.toFixed(1)} times</p>
	</div>
{/if}

<style>
	/* The frame owns the gesture outright: no page pan, no long-press callout. */
	.lightbox-frame {
		touch-action: none;
		-webkit-touch-callout: none;
	}
</style>
