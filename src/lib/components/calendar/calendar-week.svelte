<script lang="ts" module>
	/**
	 * Where the hours were scrolled to, kept across weeks: paging from one
	 * week to the next must not throw the reader back to the morning.
	 */
	let lastScrollTop: number | null = null;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		HOUR_HEIGHT,
		MINUTES_PER_DAY,
		SNAP_MINUTES,
		allDaySlot,
		atMinutes,
		dayKey,
		daysBetween,
		durationMinutes,
		eventStart,
		formatDay,
		hourLabel,
		isBanner,
		isSameDay,
		layoutDay,
		layoutRow,
		minutesAtY,
		minutesOfDay,
		resizedTo,
		shifted,
		snapMinutes,
		timedSlot,
		type Placement,
		type PlacedEvent
	} from '$lib/calendar';
	import { motionEnter, springs } from '$lib/motion.js';
	import type { CalendarEvent } from '$lib/server/crm/calendar';
	import { cn } from '$lib/utils.js';
	import Event from './calendar-event.svelte';
	import type {
		CalendarAnchor,
		MoveHandler,
		SelectEventHandler,
		SelectSlotHandler,
		SlotSelection
	} from './types';

	/**
	 * The week — and the day, which is a week of one. An all-day strip on top
	 * laid out in lanes like a month row, then the hours: one column per day,
	 * blocks placed by the minute and shared side by side where they
	 * overlap, a line across today at the current time.
	 *
	 * Three gestures, all pointer events with capture so a drag survives
	 * leaving the block: press and move a block to move it (snapped to the
	 * quarter hour, and across columns to another day), drag its bottom edge
	 * to stretch it, and press and drag on empty hours to draw a new one —
	 * a plain click books the hour it landed in. Nothing is written here:
	 * every gesture ends in a callback and the page owns the write, which is
	 * also why a block being dragged is drawn from a local placement rather
	 * than from the events prop.
	 */

	const GUTTER = 56;
	const BAR_LANE = 24;
	/** Pixels of travel before a press becomes a gesture, so a click still opens or books. */
	const LIFT = 4;
	/** What a click books: the half hour it landed in, for an hour. */
	const CLICK_SNAP = 30;
	/** Where the hours open when today is not on screen: the working morning. */
	const OPENING_HOUR = 8;
	const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
	const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
	/** The hour lines, and a fainter one at the half hour, painted rather than drawn as 48 elements. */
	const LINES = [
		`repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
		`repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT / 2}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_HEIGHT / 2}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_HEIGHT / 2 + 1}px, transparent ${HOUR_HEIGHT / 2 + 1}px, transparent ${HOUR_HEIGHT}px)`
	].join(', ');

	let {
		days,
		today,
		events,
		selectedId = null,
		canManage = false,
		draft = null,
		onSelectSlot,
		onSelectEvent,
		onMove
	}: {
		/** The columns, in order: seven for a week, one for a day. */
		days: readonly Date[];
		today: Date;
		events: readonly CalendarEvent[];
		/** The event whose details are open, drawn pressed. */
		selectedId?: string | null;
		/** Whether empty hours take clicks and blocks can be moved or stretched. */
		canManage?: boolean;
		/** A slot being booked, drawn as a ghost until the booking popover closes. */
		draft?: SlotSelection | null;
		onSelectSlot: SelectSlotHandler;
		onSelectEvent: SelectEventHandler;
		onMove: MoveHandler;
	} = $props();

	// The clock behind the line across today. A timer is a side effect by
	// nature; everything drawn from it is derived.
	let now = $state(new Date());
	$effect(() => {
		const tick = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(tick);
	});

	type Gesture =
		| {
				kind: 'move';
				event: CalendarEvent;
				dayIndex: number;
				/** Bars in the strip move by days only. */
				inStrip: boolean;
				startX: number;
				startY: number;
				placement: Placement | null;
				/**
				 * How far the bar or block is drawn from where it lives, snapped. It
				 * stays in its own lane or column for the whole drag and is translated
				 * there — see the note above `strip`.
				 */
				offset: { x: number; y: number };
				live: boolean;
		  }
		| {
				kind: 'resize';
				event: CalendarEvent;
				dayIndex: number;
				startY: number;
				placement: Placement | null;
				live: boolean;
		  }
		| {
				kind: 'draw';
				dayIndex: number;
				startY: number;
				/** Minutes from midnight where the press landed, unsnapped. */
				pressed: number;
				from: number;
				to: number;
				live: boolean;
		  };
	let gesture = $state<Gesture | null>(null);
	/** A drop is followed by a click on the same block; that click must not open it. */
	let dropped = false;

	/**
	 * Nothing is re-laid out while a gesture is live. A moved bar or block is
	 * translated where it sits and a stretched block is drawn taller in place,
	 * because re-sorting the lanes or the tracks would move the element in the
	 * DOM — and a node that moves loses the pointer capture the drag rides on.
	 */
	const strip = $derived(layoutRow(events.filter(isBanner), days));
	const stripLanes = $derived(Math.max(1, ...strip.map((segment) => segment.lane + 1)));
	const template = $derived(`${GUTTER}px repeat(${days.length}, minmax(0, 1fr))`);

	let scroller = $state<HTMLDivElement | null>(null);
	let columns = $state<(HTMLDivElement | undefined)[]>([]);

	/** Minutes from midnight down the grid, in pixels. */
	function px(minutes: number): number {
		return (minutes / 60) * HOUR_HEIGHT;
	}

	function columnWidth(): number {
		return columns[0]?.getBoundingClientRect().width ?? 1;
	}

	/** Minutes from midnight at a pointer's height, measured against one column. */
	function minutesAt(clientY: number, dayIndex: number): number {
		const column = columns[dayIndex];
		return column ? minutesAtY(clientY - column.getBoundingClientRect().top) : 0;
	}

	function clamp(value: number, low: number, high: number): number {
		return Math.min(high, Math.max(low, value));
	}

	/**
	 * Where a slot is on screen, for the popover to point at: a rectangle in
	 * a column, measured live so it follows the hours scrolling underneath.
	 */
	function slotAnchor(dayIndex: number, placement: Placement): CalendarAnchor {
		return {
			getBoundingClientRect: () => {
				const rect = columns[dayIndex]?.getBoundingClientRect() ?? new DOMRect();
				const top = px(minutesOfDay(new Date(placement.starts_at)));
				return new DOMRect(rect.left, rect.top + top, rect.width, px(durationMinutes(placement)));
			}
		};
	}

	onMount(() => {
		if (!scroller) return;
		// Open on now when today is on screen, on the morning otherwise — unless
		// the reader already scrolled somewhere this session.
		const todayShown = days.some((day) => isSameDay(day, now));
		scroller.scrollTop =
			lastScrollTop ??
			px(todayShown ? Math.max(0, minutesOfDay(now) - 60) : OPENING_HOUR * 60) - 12;
	});

	// --- blocks and bars ------------------------------------------------

	function startBlock(
		e: PointerEvent & { currentTarget: EventTarget & HTMLDivElement },
		event: CalendarEvent,
		dayIndex: number,
		inStrip: boolean
	) {
		if (!canManage) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// The column underneath must not start drawing a new event.
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		const resizing = e.target instanceof Element && e.target.closest('[data-resize]') !== null;
		gesture = resizing
			? { kind: 'resize', event, dayIndex, startY: e.clientY, placement: null, live: false }
			: {
					kind: 'move',
					event,
					dayIndex,
					inStrip,
					startX: e.clientX,
					startY: e.clientY,
					placement: null,
					offset: { x: 0, y: 0 },
					live: false
				};
	}

	function handlePointerMove(e: PointerEvent) {
		const current = gesture;
		if (!current) return;

		if (current.kind === 'move') {
			const dx = e.clientX - current.startX;
			const dy = e.clientY - current.startY;
			if (!current.live && Math.hypot(dx, dy) < LIFT) return;
			current.live = true;
			const dayDelta = clamp(
				Math.round(dx / columnWidth()),
				-current.dayIndex,
				days.length - 1 - current.dayIndex
			);
			let minuteDelta = 0;
			if (!current.inStrip) {
				const top = minutesOfDay(eventStart(current.event));
				const length = durationMinutes(current.event);
				minuteDelta = clamp(
					Math.round(((dy / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES,
					-top,
					MINUTES_PER_DAY - top - length
				);
			}
			current.placement = shifted(current.event, dayDelta, minuteDelta);
			current.offset = { x: dayDelta * columnWidth(), y: px(minuteDelta) };
			return;
		}

		if (current.kind === 'resize') {
			if (!current.live && Math.abs(e.clientY - current.startY) < LIFT) return;
			current.live = true;
			const day = days[current.dayIndex];
			current.placement = resizedTo(
				current.event,
				day,
				snapMinutes(minutesAt(e.clientY, current.dayIndex))
			);
			return;
		}

		if (!current.live && Math.abs(e.clientY - current.startY) < LIFT) return;
		current.live = true;
		const at = snapMinutes(minutesAt(e.clientY, current.dayIndex));
		current.to = Math.max(current.from + SNAP_MINUTES, at);
	}

	function handlePointerUp() {
		const current = gesture;
		if (!current) return;
		gesture = null;

		if (current.kind === 'draw') {
			const day = days[current.dayIndex];
			const placement: Placement = current.live
				? {
						starts_at: atMinutes(day, current.from).toISOString(),
						ends_at: atMinutes(day, current.to).toISOString()
					}
				: timedSlot(day, snapMinutes(current.pressed, 'floor', CLICK_SNAP));
			onSelectSlot({ ...placement, allDay: false }, slotAnchor(current.dayIndex, placement));
			return;
		}

		if (!current.live) return;
		dropped = true;
		// The click lands in the same task; anything later was a real click.
		setTimeout(() => (dropped = false), 0);
		if (current.placement) onMove(current.event, current.placement);
	}

	function cancelGesture() {
		gesture = null;
	}

	function handleClick(
		e: MouseEvent & { currentTarget: EventTarget & HTMLDivElement },
		event: CalendarEvent
	) {
		if (dropped) {
			dropped = false;
			return;
		}
		onSelectEvent(event, e.currentTarget);
	}

	function handleKeydown(
		e: KeyboardEvent & { currentTarget: EventTarget & HTMLDivElement },
		event: CalendarEvent
	) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		onSelectEvent(event, e.currentTarget);
	}

	function isLifted(id: string): boolean {
		return gesture?.kind !== 'draw' && gesture?.live === true && gesture.event.id === id;
	}

	/** Where a bar or a block is drawn while it is being moved: translated, never re-homed. */
	function liftedOffset(id: string): string {
		if (gesture?.kind !== 'move' || !gesture.live || gesture.event.id !== id) return 'none';
		return `translate(${gesture.offset.x}px, ${gesture.offset.y}px)`;
	}

	/** A block's height in pixels — the stretched one drawn at the length the gesture says. */
	function blockHeight(block: PlacedEvent<CalendarEvent>): number {
		const stretched =
			gesture?.kind === 'resize' && gesture.live && gesture.event.id === block.event.id
				? gesture.placement
				: null;
		return px(stretched ? durationMinutes(stretched) : block.height) - 2;
	}

	// --- empty hours ----------------------------------------------------

	function startDraw(
		e: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement },
		dayIndex: number
	) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		const pressed = minutesAt(e.clientY, dayIndex);
		const from = snapMinutes(pressed, 'floor');
		gesture = {
			kind: 'draw',
			dayIndex,
			startY: e.clientY,
			pressed,
			from,
			to: from + 2 * SNAP_MINUTES,
			live: false
		};
	}

	/** Enter or Space on a column's surface, which has no pointer to place it: book the morning. */
	function bookByKey(e: KeyboardEvent, dayIndex: number) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		const placement = timedSlot(days[dayIndex], OPENING_HOUR * 60 + 60);
		onSelectSlot({ ...placement, allDay: false }, slotAnchor(dayIndex, placement));
	}

	/** The ghost of what is being drawn or booked in a column, if anything. */
	function ghostIn(dayIndex: number): { top: number; height: number } | null {
		if (gesture?.kind === 'draw' && gesture.live && gesture.dayIndex === dayIndex) {
			return { top: px(gesture.from), height: px(gesture.to - gesture.from) };
		}
		if (draft && !draft.allDay) {
			const start = new Date(draft.starts_at);
			if (isSameDay(start, days[dayIndex])) {
				return { top: px(minutesOfDay(start)), height: px(durationMinutes(draft)) };
			}
		}
		return null;
	}

	/** The column an all-day draft starts in, and how many it spans. */
	const stripDraft = $derived.by(() => {
		if (!draft?.allDay || days.length === 0) return null;
		const start = new Date(draft.starts_at);
		const col = daysBetween(days[0], start);
		if (col < 0 || col >= days.length) return null;
		const span = Math.max(
			1,
			daysBetween(start, new Date(new Date(draft.ends_at).getTime() - 1)) + 1
		);
		return { col, span: Math.min(span, days.length - col) };
	});
</script>

<!-- Capture delivers the pointer's release to the element that took it; the
     window handler is the net under that, so a live gesture never outlives a
     release it somehow missed. -->
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && gesture) cancelGesture();
	}}
	onpointerup={() => {
		if (gesture?.live) handlePointerUp();
	}}
	onblur={cancelGesture}
/>

<div data-slot="calendar-week" class="flex h-full min-h-0 flex-1 flex-col">
	<!-- The days -->
	<div class="grid border-b" style:grid-template-columns={template}>
		<div class="border-r"></div>
		{#each days as day (dayKey(day))}
			{@const isToday = isSameDay(day, today)}
			<div class="flex flex-col items-center gap-0.5 border-l py-2 first:border-l-0">
				<span
					class={cn(
						'text-[11px] font-medium tracking-wide uppercase',
						isToday ? 'text-primary' : 'text-muted-foreground'
					)}
				>
					{WEEKDAY.format(day)}
				</span>
				<span
					class={cn(
						'inline-flex size-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums transition-colors',
						isToday && 'bg-primary text-primary-foreground shadow-sm'
					)}
				>
					{day.getDate()}
				</span>
			</div>
		{/each}
	</div>

	<!-- The all-day strip -->
	<div class="grid border-b" style:grid-template-columns={template}>
		<div
			class="text-muted-foreground border-r pe-2 pt-1.5 text-end text-[10px] font-medium uppercase"
		>
			all-day
		</div>
		<div
			class="relative"
			style:grid-column="2 / -1"
			style:min-height="{stripLanes * BAR_LANE + 8}px"
		>
			<div
				class="absolute inset-0 grid"
				style:grid-template-columns="repeat({days.length}, minmax(0, 1fr))"
			>
				{#each days as day (dayKey(day))}
					{#if canManage}
						<button
							type="button"
							class="hover:bg-accent/40 focus-visible:ring-ring/40 cursor-pointer border-l transition-colors outline-none first:border-l-0 focus-visible:ring-[3px] focus-visible:ring-inset"
							aria-label="New all-day event on {formatDay(day)}"
							onclick={(e) => onSelectSlot({ ...allDaySlot(day), allDay: true }, e.currentTarget)}
						></button>
					{:else}
						<div class="border-l first:border-l-0"></div>
					{/if}
				{/each}
			</div>
			<div
				class="pointer-events-none relative grid py-1"
				style:grid-template-columns="repeat({days.length}, minmax(0, 1fr))"
				style:grid-auto-rows="{BAR_LANE}px"
			>
				{#each strip as segment (segment.event.id)}
					<div
						class={cn(
							'pointer-events-auto min-w-0 px-1',
							isLifted(segment.event.id) && 'relative z-30'
						)}
						style:grid-column="{segment.startCol + 1} / {segment.endCol + 1}"
						style:grid-row={segment.lane + 1}
						style:transform={liftedOffset(segment.event.id)}
					>
						<Event
							event={segment.event}
							variant="bar"
							selected={segment.event.id === selectedId}
							lifted={isLifted(segment.event.id)}
							continuesBefore={segment.continuesBefore}
							continuesAfter={segment.continuesAfter}
							onpointerdown={(e) => startBlock(e, segment.event, segment.startCol, true)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}
							onpointercancel={cancelGesture}
							onlostpointercapture={cancelGesture}
							onclick={(e) => handleClick(e, segment.event)}
							onkeydown={(e) => handleKeydown(e, segment.event)}
						/>
					</div>
				{/each}
				{#if stripDraft}
					<div
						class="border-primary/60 bg-primary/10 text-primary mx-1 flex h-[22px] items-center rounded-md border border-dashed px-2 text-xs font-medium"
						style:grid-column="{stripDraft.col + 1} / {stripDraft.col + stripDraft.span + 1}"
						style:grid-row={stripLanes + 1}
					>
						New event
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- The hours -->
	<div
		bind:this={scroller}
		class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
		onscroll={(e) => (lastScrollTop = e.currentTarget.scrollTop)}
	>
		<div
			class="relative grid"
			style:grid-template-columns={template}
			style:height="{px(MINUTES_PER_DAY)}px"
		>
			<div class="relative border-r">
				{#each HOURS as hour (hour)}
					{#if hour > 0}
						<span
							class="text-muted-foreground absolute end-2 -translate-y-1/2 text-[11px] tabular-nums"
							style:top="{px(hour * 60)}px"
						>
							{hourLabel(hour)}
						</span>
					{/if}
				{/each}
			</div>

			{#each days as day, dayIndex (dayKey(day))}
				{@const placed = layoutDay(events, day)}
				{@const isToday = isSameDay(day, today)}
				{@const ghost = ghostIn(dayIndex)}
				<div
					bind:this={columns[dayIndex]}
					class={cn('relative border-l first:border-l-0', isToday && 'bg-primary/[0.025]')}
					style:background-image={LINES}
				>
					{#if canManage}
						<!-- The drawing surface sits behind the blocks and takes the whole column:
						     a press and drag draws a new event, a click books the half hour it
						     landed in, and a keyboard press books the morning. -->
						<button
							type="button"
							class="focus-visible:ring-ring/40 absolute inset-0 w-full cursor-cell rounded-none outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
							aria-label="Book a time on {formatDay(day)}"
							onpointerdown={(e) => startDraw(e, dayIndex)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}
							onpointercancel={cancelGesture}
							onlostpointercapture={cancelGesture}
							onkeydown={(e) => bookByKey(e, dayIndex)}
						></button>
					{/if}
					{#each placed as block (block.event.id)}
						{@const height = blockHeight(block)}
						<Event
							event={block.event}
							variant="block"
							resizable={canManage}
							selected={block.event.id === selectedId}
							lifted={isLifted(block.event.id)}
							{height}
							style="top: {px(block.top)}px; height: {height}px; left: calc({(block.column /
								block.columns) *
								100}% + 2px); width: calc({100 / block.columns}% - 4px); transform: {liftedOffset(
								block.event.id
							)};"
							onpointerdown={(e) => startBlock(e, block.event, dayIndex, false)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}
							onpointercancel={cancelGesture}
							onlostpointercapture={cancelGesture}
							onclick={(e) => handleClick(e, block.event)}
							onkeydown={(e) => handleKeydown(e, block.event)}
							{@attach motionEnter({ opacity: [0, 1], scale: [0.92, 1] }, springs.snap)}
						/>
					{/each}

					{#if ghost}
						<div
							class="border-primary/60 bg-primary/10 text-primary pointer-events-none absolute inset-x-0.5 z-10 flex items-start rounded-lg border border-dashed px-2.5 py-1.5 text-xs font-medium"
							style:top="{ghost.top}px"
							style:height="{Math.max(ghost.height - 2, 14)}px"
						>
							New event
						</div>
					{/if}

					{#if isSameDay(day, now)}
						<div
							class="pointer-events-none absolute inset-x-0 z-20"
							style:top="{px(minutesOfDay(now))}px"
						>
							<span
								class="absolute -top-[5px] -left-[6px] size-3 rounded-full bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68/0.2)] dark:bg-red-400"
							></span>
							<span class="block h-0.5 bg-red-500 dark:bg-red-400"></span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
