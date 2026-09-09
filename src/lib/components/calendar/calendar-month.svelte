<script lang="ts">
	import {
		dayKey,
		eventStart,
		formatDay,
		isSameDay,
		layoutRow,
		monthGrid,
		movedToDay,
		overflowCount,
		parseDayKey,
		type RowSegment
	} from '$lib/calendar';
	import { motionTransition, springs } from '$lib/motion.js';
	import type { CalendarEvent } from '$lib/server/crm/calendar';
	import { cn } from '$lib/utils.js';
	import Event from './calendar-event.svelte';
	import type { MoveHandler, SelectEventHandler } from './types';

	/**
	 * The month: five or six rows of seven, each row laid out as lanes so a
	 * multi-day event is one bar across its days and a busy Tuesday says
	 * "+3 more" rather than overflowing. A chip lifts under the pointer and
	 * follows it; the cell it is over lights up; letting go drops the event
	 * on that day at the time of day it already had. The page owns the
	 * events and the write — this only reports where the chip landed.
	 */

	/** Monday first, the way `monthGrid()` builds the rows. */
	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	/** A cell's anatomy, in pixels: the number line, one lane of chips, and room under the last. */
	const NUMBER_ROW = 28;
	const LANE = 24;
	const ROW_PAD = 4;
	/** Pixels of travel before a press becomes a drag, so a click still opens the event. */
	const LIFT = 4;

	let {
		anchor,
		today,
		events,
		selectedId = null,
		canManage = false,
		onSelectDay,
		onSelectEvent,
		onOpenDay,
		onMove
	}: {
		/** Any day in the month to show. */
		anchor: Date;
		today: Date;
		events: readonly CalendarEvent[];
		/** The event whose details are open, drawn pressed. */
		selectedId?: string | null;
		/** Whether the grid takes clicks on empty days and lets chips be dragged. */
		canManage?: boolean;
		/** An empty part of a day was clicked: book something on it. */
		onSelectDay: (day: Date, anchor: HTMLElement) => void;
		onSelectEvent: SelectEventHandler;
		/** "+N more" was clicked: the day deserves its own screen. */
		onOpenDay: (day: Date) => void;
		onMove: MoveHandler;
	} = $props();

	const rows = $derived(monthGrid(anchor));
	let gridHeight = $state(0);
	const rowHeight = $derived(rows.length > 0 ? gridHeight / rows.length : 0);
	/** How many lanes a cell has room for under its number. */
	const fit = $derived(Math.max(1, Math.floor((rowHeight - NUMBER_ROW - ROW_PAD) / LANE)));

	/**
	 * The lanes a row shows. Every lane that fits — unless some day in the row
	 * has more than fits, in which case the last lane is given up for the
	 * "+N more" line. Decided per row rather than per cell so a bar across
	 * several days is either drawn in all of them or in none.
	 */
	function lanesFor(segments: readonly RowSegment<CalendarEvent>[]): number {
		const crowded = Array.from({ length: 7 }, (_, col) =>
			segments.filter((s) => s.startCol <= col && col < s.endCol)
		).some((covering) => covering.length > fit);
		return Math.max(1, crowded ? fit - 1 : fit);
	}

	type Drag = {
		event: CalendarEvent;
		startX: number;
		startY: number;
		dx: number;
		dy: number;
		/** True once the press has travelled far enough to count as a drag. */
		live: boolean;
		/** The day under the pointer, as a key. */
		target: string | null;
	};
	let drag = $state<Drag | null>(null);
	let gridEl = $state<HTMLDivElement | null>(null);
	/** A drop is followed by a click on the same chip; that click must not open it. */
	let dropped = false;

	/** The day under a point in the grid, from the grid's own geometry: no per-cell hit testing. */
	function dayAt(x: number, y: number): Date | null {
		if (!gridEl) return null;
		const rect = gridEl.getBoundingClientRect();
		const col = Math.min(6, Math.max(0, Math.floor(((x - rect.left) / rect.width) * 7)));
		const row = Math.min(
			rows.length - 1,
			Math.max(0, Math.floor(((y - rect.top) / rect.height) * rows.length))
		);
		return rows[row]?.[col] ?? null;
	}

	function handlePointerDown(
		e: PointerEvent & { currentTarget: EventTarget & HTMLDivElement },
		event: CalendarEvent
	) {
		if (!canManage) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		drag = { event, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, live: false, target: null };
	}

	function handlePointerMove(e: PointerEvent) {
		if (!drag) return;
		const dx = e.clientX - drag.startX;
		const dy = e.clientY - drag.startY;
		if (!drag.live && Math.hypot(dx, dy) < LIFT) return;
		drag.live = true;
		drag.dx = dx;
		drag.dy = dy;
		const day = dayAt(e.clientX, e.clientY);
		drag.target = day ? dayKey(day) : null;
	}

	function handlePointerUp() {
		if (!drag) return;
		const { event, live, target } = drag;
		drag = null;
		if (!live) return;
		dropped = true;
		// The click lands in the same task; anything later was a real click.
		setTimeout(() => (dropped = false), 0);
		const day = target ? parseDayKey(target) : null;
		if (day && !isSameDay(day, eventStart(event))) onMove(event, movedToDay(event, day));
	}

	function cancelDrag() {
		drag = null;
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

	function liftedOffset(id: string): string | undefined {
		return drag?.live && drag.event.id === id ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && drag) cancelDrag();
	}}
	onblur={cancelDrag}
/>

<div data-slot="calendar-month" class="flex h-full min-h-0 flex-1 flex-col">
	<div
		class="text-muted-foreground grid grid-cols-7 border-b text-[11px] font-medium tracking-wide uppercase"
	>
		{#each WEEKDAYS as name (name)}
			<div class="px-2 py-1.5 text-center">{name}</div>
		{/each}
	</div>

	<div
		bind:this={gridEl}
		bind:clientHeight={gridHeight}
		class="grid min-h-0 flex-1"
		style:grid-template-rows="repeat({rows.length}, minmax(0, 1fr))"
	>
		{#each rows as week (dayKey(week[0]))}
			{@const segments = layoutRow(events, week)}
			{@const maxLanes = lanesFor(segments)}
			<div class="relative grid min-h-0 grid-cols-7 border-b last:border-b-0">
				{#each week as day, col (dayKey(day))}
					{@const outside = day.getMonth() !== anchor.getMonth()}
					{@const isToday = isSameDay(day, today)}
					{@const hidden = overflowCount(segments, col, maxLanes)}
					{@const droppingHere = drag?.live === true && drag.target === dayKey(day)}
					<div
						class={cn(
							'relative min-w-0 border-r transition-colors duration-150 last:border-r-0',
							outside && 'bg-muted/40',
							droppingHere && 'bg-primary/[0.06]'
						)}
					>
						{#if canManage}
							<!-- The click target sits behind the chips and takes the whole cell, so
							     keyboard users reach every day and pointer users never miss. -->
							<button
								type="button"
								class="hover:bg-accent/40 focus-visible:ring-ring/40 absolute inset-0 w-full cursor-pointer rounded-none transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
								aria-label="New event on {formatDay(day)}"
								onclick={(e) => onSelectDay(day, e.currentTarget)}
							></button>
						{/if}
						<div class="pointer-events-none relative flex h-7 items-center justify-end px-1.5">
							<span
								class={cn(
									'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums transition-colors',
									isToday
										? 'bg-primary text-primary-foreground font-semibold shadow-sm'
										: outside
											? 'text-muted-foreground/60'
											: 'text-foreground/80'
								)}
							>
								{day.getDate() === 1 ? `${MONTHS[day.getMonth()]} 1` : day.getDate()}
							</span>
						</div>
						{#if hidden > 0}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground absolute inset-x-1 bottom-0.5 truncate px-1.5 text-left text-[11px] font-medium transition-colors"
								onclick={() => onOpenDay(day)}
							>
								+{hidden} more
							</button>
						{/if}
					</div>
				{/each}

				<!-- The lanes, over the cells: a bar spans its columns, a chip takes one. -->
				<div
					class="pointer-events-none absolute inset-x-0 grid"
					style:top="{NUMBER_ROW}px"
					style:grid-template-columns="repeat(7, minmax(0, 1fr))"
					style:grid-auto-rows="{LANE}px"
				>
					{#each segments as segment (segment.event.id)}
						{#if segment.lane < maxLanes}
							{@const offset = liftedOffset(segment.event.id)}
							<div
								class={cn('pointer-events-auto relative min-w-0 px-1', offset && 'z-30')}
								style:grid-column="{segment.startCol + 1} / {segment.endCol + 1}"
								style:grid-row={segment.lane + 1}
								style:transform={offset}
								in:motionTransition={{
									keyframes: { opacity: [0, 1], scale: [0.85, 1] },
									transition: springs.snap,
									reduced: { keyframes: { opacity: [0, 1] } }
								}}
							>
								<Event
									event={segment.event}
									variant={segment.banner ? 'bar' : 'chip'}
									selected={segment.event.id === selectedId}
									lifted={offset !== undefined}
									continuesBefore={segment.continuesBefore}
									continuesAfter={segment.continuesAfter}
									onpointerdown={(e) => handlePointerDown(e, segment.event)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									onpointercancel={cancelDrag}
									onlostpointercapture={cancelDrag}
									onclick={(e) => handleClick(e, segment.event)}
									onkeydown={(e) => handleKeydown(e, segment.event)}
								/>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
