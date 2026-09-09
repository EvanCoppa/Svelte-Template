import {
	BADGE_TONE_CLASSES,
	BADGE_TONE_DOT_CLASSES,
	BADGE_TONES,
	type BadgeTone
} from '$lib/components/ui/badge/badge-tones.js';
import type { CalendarEvent, InstantRange } from '$lib/server/crm/calendar';

/**
 * What the calendar IS to the browser: which days a view shows, where an
 * event sits on the grid, what a drag turns into, and how a time is written.
 *
 * Pure on purpose, like `$lib/notes`: the page and the parts in
 * `$lib/components/calendar/` read this file, so an event lands in the same
 * cell and is called the same thing wherever it is drawn — and every rule
 * here is testable without a browser.
 *
 * Every Date in this file is LOCAL time. A calendar is a wall-clock
 * instrument: the 9:00 that a booking says is the viewer's 9:00, and the day
 * a block belongs to is the day it starts in the viewer's zone. The database
 * only ever sees instants (the calendar migration), and `ends_at` is
 * exclusive throughout — a 9–10 meeting ends at 10:00 sharp, and an all-day
 * event ends at the next midnight — which is what lets an overlap be one
 * comparison and a resize a change to one column. The one exception is
 * `fetchWindow()`, which runs on the server and works in UTC on purpose.
 */

export const CALENDAR_VIEWS = ['month', 'week', 'day'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** The week is where dragging and stretching earn their keep, so it is the door. */
export const DEFAULT_VIEW: CalendarView = 'week';

export function isCalendarView(value: string | null | undefined): value is CalendarView {
	return CALENDAR_VIEWS.some((view) => view === value);
}

/** The grid a drag snaps to, and the shortest an event can be stretched to. */
export const SNAP_MINUTES = 15;
export const MIN_EVENT_MINUTES = 15;
/** What a click on an empty slot books. */
export const DEFAULT_EVENT_MINUTES = 60;
/** Pixels per hour in the timed grid; the parts and the pointer math share it. */
export const HOUR_HEIGHT = 56;
export const MINUTES_PER_DAY = 24 * 60;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// ---------------------------------------------------------------------------
// Days — local, DST-safe (set* methods, never millisecond arithmetic across days)
// ---------------------------------------------------------------------------

export function startOfDay(date: Date): Date {
	const day = new Date(date);
	day.setHours(0, 0, 0, 0);
	return day;
}

export function addDays(date: Date, days: number): Date {
	const moved = new Date(date);
	moved.setDate(moved.getDate() + days);
	return moved;
}

export function addMonths(date: Date, months: number): Date {
	const moved = new Date(date);
	moved.setMonth(moved.getMonth() + months);
	return moved;
}

export function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** The Monday on or before `date`: the week starts on Monday throughout. */
export function startOfWeek(date: Date): Date {
	const day = startOfDay(date);
	return addDays(day, -((day.getDay() + 6) % 7));
}

export function startOfMonth(date: Date): Date {
	const day = startOfDay(date);
	day.setDate(1);
	return day;
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** A local calendar day as `YYYY-MM-DD` — the `?date=` param and every cell's key. */
export function dayKey(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a `YYYY-MM-DD` key, or null for anything that is not one. */
export function parseDayKey(key: string | null | undefined): Date | null {
	const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	// February 30th rolls over into March; a key that does not round-trip was never a day.
	return dayKey(day) === key ? day : null;
}

/** Minutes since local midnight. */
export function minutesOfDay(date: Date): number {
	return date.getHours() * 60 + date.getMinutes();
}

/** The instant `minutes` into `day`, by the wall clock — 10:00 is 10:00 on a DST day too. */
export function atMinutes(day: Date, minutes: number): Date {
	const at = startOfDay(day);
	at.setMinutes(minutes);
	return at;
}

/** Whole days from `from` to `to`, by calendar day rather than by 24-hour spans. */
export function daysBetween(from: Date, to: Date): number {
	return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// The visible grid
// ---------------------------------------------------------------------------

/** The month as rows of seven, Monday first, padded to whole weeks — five or six of them. */
export function monthGrid(anchor: Date): Date[][] {
	const first = startOfWeek(startOfMonth(anchor));
	const lastOfMonth = addDays(startOfMonth(addMonths(startOfMonth(anchor), 1)), -1);
	const rows = Math.ceil((daysBetween(first, lastOfMonth) + 1) / 7);
	return Array.from({ length: rows }, (_, row) =>
		Array.from({ length: 7 }, (_, col) => addDays(first, row * 7 + col))
	);
}

/** The days a view lays out for an anchor date, in order. */
export function visibleDays(view: CalendarView, anchor: Date): Date[] {
	switch (view) {
		case 'month':
			return monthGrid(anchor).flat();
		case 'week': {
			const monday = startOfWeek(anchor);
			return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
		}
		case 'day':
			return [startOfDay(anchor)];
	}
}

export type DayRange = { start: Date; end: Date };

/** The span a view shows, `end` exclusive like everything else here. */
export function visibleRange(view: CalendarView, anchor: Date): DayRange {
	const days = visibleDays(view, anchor);
	return { start: days[0], end: addDays(days[days.length - 1], 1) };
}

/** The anchor one step forward or back: the next month's first, the next week, the next day. */
export function shiftAnchor(view: CalendarView, anchor: Date, delta: -1 | 1): Date {
	switch (view) {
		case 'month':
			return addMonths(startOfMonth(anchor), delta);
		case 'week':
			return addDays(anchor, 7 * delta);
		case 'day':
			return addDays(anchor, delta);
	}
}

// A fixed locale keeps the server render and the hydrated render identical,
// the way every list page formats.
const LOCALE = 'en-US';
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const monthDay = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(LOCALE, {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});
const fullDay = new Intl.DateTimeFormat(LOCALE, {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});
const shortDay = new Intl.DateTimeFormat(LOCALE, {
	weekday: 'short',
	month: 'short',
	day: 'numeric'
});
const longDay = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
const clock = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });

/** What the toolbar calls the span on screen: "September 2026", "Sep 7 – 13, 2026", "Tuesday, September 9, 2026". */
export function rangeLabel(view: CalendarView, anchor: Date): string {
	switch (view) {
		case 'month':
			return monthYear.format(anchor);
		case 'week': {
			const start = startOfWeek(anchor);
			const end = addDays(start, 6);
			if (start.getFullYear() !== end.getFullYear()) {
				return `${monthDayYear.format(start)} – ${monthDayYear.format(end)}`;
			}
			if (start.getMonth() !== end.getMonth()) {
				return `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getFullYear()}`;
			}
			return `${monthDay.format(start)} – ${end.getDate()}, ${end.getFullYear()}`;
		}
		case 'day':
			return fullDay.format(anchor);
	}
}

// ---------------------------------------------------------------------------
// The server's window — wider than any viewer's grid, so the zone never matters
// ---------------------------------------------------------------------------

/**
 * What the load fetches for a view and a `?date=` key. The server does not
 * know the viewer's zone, so it does not try to compute their grid: it works
 * in UTC and pads generously — a couple of days each side of a week, a week
 * or two around a month — and the browser draws its own local grid from the
 * superset. Over-fetching a few days is cheaper than being one day short at
 * either edge.
 *
 * With no key the anchor is today by the server's clock, and the viewer's
 * today is at most a day away — but their week or month may be the one
 * before or after (Sunday evening in Los Angeles is Monday in UTC), so that
 * case pads a whole period each side rather than a few days.
 */
export function fetchWindow(
	view: CalendarView,
	anchorKey: string | null | undefined,
	today: Date
): InstantRange {
	const pinned = anchorKey?.match(/^\d{4}-\d{2}-\d{2}$/)
		? new Date(`${anchorKey}T00:00:00Z`)
		: null;
	if (pinned && Number.isNaN(pinned.getTime())) {
		return fetchWindow(view, null, today);
	}
	const anchor =
		pinned ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
	/** Whole periods of slack each side when the day on screen is the viewer's, not the URL's. */
	const slack = pinned ? 0 : 1;

	const utcDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
	switch (view) {
		case 'month': {
			const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - slack, 1));
			const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1 + slack, 1));
			return { from: utcDays(first, -8).toISOString(), to: utcDays(next, 15).toISOString() };
		}
		case 'week': {
			const monday = utcDays(anchor, -((anchor.getUTCDay() + 6) % 7));
			return {
				from: utcDays(monday, -2 - 7 * slack).toISOString(),
				to: utcDays(monday, 9 + 7 * slack).toISOString()
			};
		}
		case 'day':
			return { from: utcDays(anchor, -2).toISOString(), to: utcDays(anchor, 3).toISOString() };
	}
}

// ---------------------------------------------------------------------------
// Where an event sits
// ---------------------------------------------------------------------------

/** The columns the grid reads; a full row has more, and a drag preview needs no more. */
export type GridEvent = Pick<
	CalendarEvent,
	'id' | 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'color'
>;

export function eventStart(event: Pick<GridEvent, 'starts_at'>): Date {
	return new Date(event.starts_at);
}

export function eventEnd(event: Pick<GridEvent, 'ends_at'>): Date {
	return new Date(event.ends_at);
}

export function durationMinutes(event: Pick<GridEvent, 'starts_at' | 'ends_at'>): number {
	return Math.round((eventEnd(event).getTime() - eventStart(event).getTime()) / MINUTE_MS);
}

/** Does the event occupy any of `[start, end)`? */
export function overlaps(
	event: Pick<GridEvent, 'starts_at' | 'ends_at'>,
	start: Date,
	end: Date
): boolean {
	return eventStart(event) < end && eventEnd(event) > start;
}

/**
 * Drawn as a bar across the top rather than a block in the hours: every
 * all-day event, and any timed one that does not start and finish on the
 * same local day (an overnight shift, a two-day install). The exclusive end
 * means "finishes at midnight" still counts as the same day.
 */
export function isBanner(event: Pick<GridEvent, 'starts_at' | 'ends_at' | 'all_day'>): boolean {
	if (event.all_day) return true;
	const lastInstant = new Date(eventEnd(event).getTime() - 1);
	return !isSameDay(eventStart(event), lastInstant);
}

/**
 * One event's run across one row of days: the month view lays each week out
 * this way, and the week view's all-day strip is one such row.
 */
export type RowSegment<T extends GridEvent> = {
	event: T;
	/** Column span within the row, `endCol` exclusive. */
	startCol: number;
	endCol: number;
	/** The stack position; the greedy packer keeps banners on top. */
	lane: number;
	banner: boolean;
	/** The event runs past the row's edge, so the bar is drawn open-ended there. */
	continuesBefore: boolean;
	continuesAfter: boolean;
};

/**
 * Packs everything that touches a row of days into lanes. Banners come
 * first — sorted by where they start, longest first — then the timed events
 * of each day in start order, and each takes the highest lane free across
 * every column it spans. That is what gives a multi-day bar one unbroken
 * run and keeps a Tuesday chip from sitting above a Monday-to-Wednesday bar.
 */
export function layoutRow<T extends GridEvent>(
	events: readonly T[],
	days: readonly Date[]
): RowSegment<T>[] {
	if (days.length === 0) return [];
	const rowStart = startOfDay(days[0]);
	const rowEnd = addDays(startOfDay(days[days.length - 1]), 1);
	const columnOf = (instant: Date) =>
		Math.min(days.length - 1, Math.max(0, daysBetween(rowStart, instant)));

	const segments: RowSegment<T>[] = [];
	for (const event of events) {
		if (!overlaps(event, rowStart, rowEnd)) continue;
		const start = eventStart(event);
		const end = eventEnd(event);
		const banner = isBanner(event);
		const startCol = columnOf(start);
		const endCol = banner ? columnOf(new Date(end.getTime() - 1)) + 1 : startCol + 1;
		segments.push({
			event,
			startCol,
			endCol,
			lane: 0,
			banner,
			continuesBefore: banner && start < rowStart,
			continuesAfter: banner && end > rowEnd
		});
	}

	segments.sort(
		(a, b) =>
			Number(b.banner) - Number(a.banner) ||
			a.startCol - b.startCol ||
			b.endCol - b.startCol - (a.endCol - a.startCol) ||
			a.event.starts_at.localeCompare(b.event.starts_at) ||
			a.event.title.localeCompare(b.event.title)
	);

	// Per lane, the column spans already taken.
	const lanes: [number, number][][] = [];
	for (const segment of segments) {
		let lane = lanes.findIndex((taken) =>
			taken.every(([from, to]) => segment.endCol <= from || segment.startCol >= to)
		);
		if (lane === -1) {
			lane = lanes.length;
			lanes.push([]);
		}
		lanes[lane].push([segment.startCol, segment.endCol]);
		segment.lane = lane;
	}
	return segments;
}

/**
 * How many of a column's segments do not fit in `maxLanes` — the "+N more"
 * a month cell shows when the row is taller than the cell. A segment is
 * counted in every column it covers, so a hidden three-day bar says so on
 * all three days.
 */
export function overflowCount<T extends GridEvent>(
	segments: readonly RowSegment<T>[],
	col: number,
	maxLanes: number
): number {
	return segments.filter((s) => s.startCol <= col && col < s.endCol && s.lane >= maxLanes).length;
}

/** One timed event placed in a day column: minutes from midnight, and its share of the width. */
export type PlacedEvent<T extends GridEvent> = {
	event: T;
	top: number;
	height: number;
	/** Which of `columns` side-by-side tracks the block sits in, when events overlap. */
	column: number;
	columns: number;
};

/**
 * Lays one day's timed events out side by side where they overlap. Events
 * are swept in start order into clusters — runs where each one overlaps the
 * cluster so far — and inside a cluster each takes the first track that is
 * free by the time it starts. Every block in a cluster shares the cluster's
 * track count, so two overlapping meetings are halves and three are thirds,
 * while an event alone in the afternoon keeps the full width.
 */
export function layoutDay<T extends GridEvent>(events: readonly T[], day: Date): PlacedEvent<T>[] {
	const dayStart = startOfDay(day);
	const dayEnd = addDays(dayStart, 1);

	const placed: PlacedEvent<T>[] = events
		.filter((event) => !isBanner(event) && overlaps(event, dayStart, dayEnd))
		.map((event) => {
			// Not a banner, so it starts and ends on this day — or ends exactly at
			// midnight, which reads as the bottom of the grid.
			const top = minutesOfDay(eventStart(event));
			const end = eventEnd(event);
			const bottom = isSameDay(end, dayStart) ? minutesOfDay(end) : MINUTES_PER_DAY;
			return {
				event,
				top,
				height: Math.max(bottom - top, MIN_EVENT_MINUTES),
				column: 0,
				columns: 1
			};
		})
		.sort(
			(a, b) => a.top - b.top || b.height - a.height || a.event.title.localeCompare(b.event.title)
		);

	let cluster: PlacedEvent<T>[] = [];
	let trackEnds: number[] = [];
	let clusterEnd = -1;
	const close = () => {
		for (const item of cluster) item.columns = trackEnds.length;
		cluster = [];
		trackEnds = [];
	};

	for (const item of placed) {
		if (item.top >= clusterEnd) close();
		let column = trackEnds.findIndex((end) => end <= item.top);
		if (column === -1) {
			column = trackEnds.length;
			trackEnds.push(0);
		}
		trackEnds[column] = item.top + item.height;
		item.column = column;
		cluster.push(item);
		clusterEnd = Math.max(clusterEnd, item.top + item.height);
	}
	close();
	return placed;
}

// ---------------------------------------------------------------------------
// The pointer, and what a gesture writes
// ---------------------------------------------------------------------------

/** Minutes onto the snap grid, kept inside the day. */
export function snapMinutes(
	minutes: number,
	mode: 'round' | 'floor' = 'round',
	step = SNAP_MINUTES
): number {
	const snapped =
		(mode === 'round' ? Math.round(minutes / step) : Math.floor(minutes / step)) * step;
	return Math.min(MINUTES_PER_DAY, Math.max(0, snapped));
}

/** Minutes from midnight at a pixel offset down the timed grid. */
export function minutesAtY(y: number, hourHeight = HOUR_HEIGHT): number {
	return Math.min(MINUTES_PER_DAY, Math.max(0, (y / hourHeight) * 60));
}

/** The two columns a gesture changes, as the action and the endpoint take them. */
export type Placement = { starts_at: string; ends_at: string };

/** The event moved by whole days and then by minutes, keeping its length. */
export function shifted(
	event: Pick<GridEvent, 'starts_at' | 'ends_at'>,
	dayDelta: number,
	minuteDelta: number
): Placement {
	const move = (instant: Date) => addMinutes(addDays(instant, dayDelta), minuteDelta);
	return {
		starts_at: move(eventStart(event)).toISOString(),
		ends_at: move(eventEnd(event)).toISOString()
	};
}

/** The event dropped on another day, at the time of day it already had. */
export function movedToDay(event: Pick<GridEvent, 'starts_at' | 'ends_at'>, day: Date): Placement {
	return shifted(event, daysBetween(eventStart(event), day), 0);
}

/** The event stretched to end `endMinutes` into `day`, never shorter than the minimum. */
export function resizedTo(
	event: Pick<GridEvent, 'starts_at' | 'ends_at'>,
	day: Date,
	endMinutes: number
): Placement {
	const start = eventStart(event);
	const floor = addMinutes(start, MIN_EVENT_MINUTES);
	const end = atMinutes(day, endMinutes);
	return { starts_at: start.toISOString(), ends_at: (end < floor ? floor : end).toISOString() };
}

/** A block starting `startMinutes` into `day`: what a click on an empty slot books. */
export function timedSlot(
	day: Date,
	startMinutes: number,
	minutes = DEFAULT_EVENT_MINUTES
): Placement {
	const start = atMinutes(day, startMinutes);
	return { starts_at: start.toISOString(), ends_at: addMinutes(start, minutes).toISOString() };
}

/** `days` whole days from `day`: midnight to midnight, the way an all-day event is stored. */
export function allDaySlot(day: Date, days = 1): Placement {
	const start = startOfDay(day);
	return { starts_at: start.toISOString(), ends_at: addDays(start, days).toISOString() };
}

// ---------------------------------------------------------------------------
// Form inputs — the wall clock in, an instant out
// ---------------------------------------------------------------------------

/** What `<input type="datetime-local">` shows for an instant: local, to the minute. */
export function toLocalDateTimeInput(iso: string): string {
	const at = new Date(iso);
	const hours = String(at.getHours()).padStart(2, '0');
	const minutes = String(at.getMinutes()).padStart(2, '0');
	return `${dayKey(at)}T${hours}:${minutes}`;
}

/** What `<input type="date">` shows for an instant: the local day it falls on. */
export function toLocalDateInput(iso: string): string {
	return dayKey(new Date(iso));
}

/** The instant a `datetime-local` value names in the browser's zone, or null when it is not one. */
export function fromLocalDateTimeInput(value: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
	const at = new Date(value);
	return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** Local midnight of a `date` value, or null. */
export function fromLocalDateInput(value: string): string | null {
	return parseDayKey(value)?.toISOString() ?? null;
}

/** The last day an all-day event covers, for the form: `ends_at` is the midnight after it. */
export function inclusiveEndDate(iso: string): string {
	return dayKey(new Date(new Date(iso).getTime() - 1));
}

/** The exclusive `ends_at` for an all-day event whose last day is `value`, or null. */
export function exclusiveEndAfter(value: string): string | null {
	const day = parseDayKey(value);
	return day ? addDays(day, 1).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Words for times
// ---------------------------------------------------------------------------

/** "9am", "9:30am", "12pm" — what fits on a chip. */
export function compactTime(date: Date): string {
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const twelve = hours % 12 === 0 ? 12 : hours % 12;
	const suffix = hours < 12 ? 'am' : 'pm';
	return minutes === 0
		? `${twelve}${suffix}`
		: `${twelve}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** "9:00 AM" — the gutter, the details and the form. */
export function formatTime(date: Date): string {
	return clock.format(date);
}

/** "Wednesday, September 9" — a cell's accessible name, and the details line's first half. */
export function formatDay(date: Date): string {
	return longDay.format(date);
}

/** "12 AM", "1 AM", … the hour gutter down the timed grid. */
export function hourLabel(hour: number): string {
	const twelve = hour % 12 === 0 ? 12 : hour % 12;
	return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "9:00 AM – 10:30 AM" for a block; an all-day event has no time to say. */
export function formatTimeRange(event: Pick<GridEvent, 'starts_at' | 'ends_at'>): string {
	return `${formatTime(eventStart(event))} – ${formatTime(eventEnd(event))}`;
}

/**
 * When an event is, in one line — what the details popover says under the
 * title: "Tuesday, September 9 · 9:00 AM – 10:30 AM"; "Thursday, September
 * 11" for an all-day event; a span for anything that crosses midnight.
 */
export function formatWhen(event: Pick<GridEvent, 'starts_at' | 'ends_at' | 'all_day'>): string {
	const start = eventStart(event);
	const end = eventEnd(event);
	if (event.all_day) {
		const last = new Date(end.getTime() - 1);
		return isSameDay(start, last)
			? longDay.format(start)
			: `${shortDay.format(start)} – ${shortDay.format(last)}`;
	}
	if (isBanner(event)) {
		return `${shortDay.format(start)}, ${formatTime(start)} – ${shortDay.format(end)}, ${formatTime(end)}`;
	}
	return `${longDay.format(start)} · ${formatTimeRange(event)}`;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** The ten tones the app owns — what the colour picker offers, and exactly what the column holds. */
export const EVENT_COLORS = BADGE_TONES;

/** What the picker calls each tone: a colour, not a status. */
export const EVENT_COLOR_NAMES = {
	neutral: 'Slate',
	success: 'Green',
	info: 'Blue',
	warning: 'Amber',
	error: 'Red',
	violet: 'Violet',
	orange: 'Orange',
	cyan: 'Cyan',
	rose: 'Rose',
	indigo: 'Indigo'
} satisfies Record<BadgeTone, string>;

/** What a block or a chip is painted: the tone's tinted surface. */
export function eventSurface(color: BadgeTone): string {
	return BADGE_TONE_CLASSES[color];
}

/** The solid stripe down a block's edge. */
export function eventAccent(color: BadgeTone): string {
	return BADGE_TONE_DOT_CLASSES[color];
}

/**
 * A swatch in the colour picker: the same fills as `eventAccent()`, spelled
 * out for every state the radio item can be in, because the item's own
 * checked and dark-mode fills would otherwise paint over them.
 */
export const EVENT_SWATCH_CLASSES = {
	neutral: 'bg-slate-400 dark:bg-slate-400 data-checked:bg-slate-400',
	success: 'bg-emerald-500 dark:bg-emerald-500 data-checked:bg-emerald-500',
	info: 'bg-blue-500 dark:bg-blue-500 data-checked:bg-blue-500',
	warning: 'bg-amber-500 dark:bg-amber-500 data-checked:bg-amber-500',
	error: 'bg-red-500 dark:bg-red-500 data-checked:bg-red-500',
	violet: 'bg-violet-500 dark:bg-violet-500 data-checked:bg-violet-500',
	orange: 'bg-orange-500 dark:bg-orange-500 data-checked:bg-orange-500',
	cyan: 'bg-cyan-500 dark:bg-cyan-500 data-checked:bg-cyan-500',
	rose: 'bg-rose-500 dark:bg-rose-500 data-checked:bg-rose-500',
	indigo: 'bg-indigo-500 dark:bg-indigo-500 data-checked:bg-indigo-500'
} satisfies Record<BadgeTone, string>;
