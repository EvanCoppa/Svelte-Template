/**
 * Free time on the calendar, found rather than drawn. Pure: it takes the busy
 * blocks and the window, and answers with the slots — nothing here reads a
 * table or knows a screen.
 *
 * Every instant is an ISO string and every wall-clock word ("9 to 5",
 * "weekdays") is read in ONE zone, the one the caller names — the calendar's
 * rule that the server never guesses a local day. `ends_at` is exclusive on
 * a `calendar_events` row, so overlap here is the same one comparison the
 * grid uses: a slot is taken when a block starts before it ends and ends
 * after it starts.
 */

export type BusyBlock = { startsAt: string; endsAt: string };

export type OpenSlot = { startsAt: string; endsAt: string };

export type SlotSearch = {
	/** The window to look in — ISO instants, `to` exclusive. */
	from: string;
	to: string;
	busy: readonly BusyBlock[];
	durationMinutes: number;
	/** The IANA zone the working day is read in. */
	timeZone: string;
	/** The working day, in local hours: a slot starts no earlier and ends no later. */
	dayStartHour: number;
	dayEndHour: number;
	weekdaysOnly: boolean;
	/** How far apart candidate starts are, in minutes. */
	stepMinutes: number;
	/** How many slots to hand back at most. */
	limit: number;
};

const MINUTE = 60_000;

/**
 * The wall-clock parts of an instant in a zone. `hourCycle: 'h23'` because
 * `hour12: false` still yields "24" at midnight in some engines, and "24"
 * would put the day one hour off.
 */
function partsIn(instant: number, timeZone: string) {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		weekday: 'short'
	});
	const read = new Map(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
	const number = (type: Intl.DateTimeFormatPartTypes) => Number(read.get(type) ?? 0);
	return {
		year: number('year'),
		month: number('month'),
		day: number('day'),
		hour: number('hour'),
		minute: number('minute'),
		second: number('second'),
		weekday: read.get('weekday') ?? ''
	};
}

/** The zone's offset from UTC at an instant, in milliseconds (local minus UTC). */
function offsetAt(instant: number, timeZone: string): number {
	const local = partsIn(instant, timeZone);
	return (
		Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
		instant
	);
}

/**
 * A wall-clock time in a zone as an instant. The offset is read at a first
 * guess and once more at the answer, which settles the reading on either
 * side of a daylight-saving change.
 */
function instantOf(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	timeZone: string
): number {
	const guess = Date.UTC(year, month - 1, day, hour, minute);
	const first = guess - offsetAt(guess, timeZone);
	const second = guess - offsetAt(first, timeZone);
	return second;
}

function isWeekend(weekday: string): boolean {
	return weekday === 'Sat' || weekday === 'Sun';
}

function isTaken(start: number, end: number, busy: readonly BusyBlock[]): boolean {
	return busy.some((block) => Date.parse(block.startsAt) < end && Date.parse(block.endsAt) > start);
}

/**
 * The open slots in a window, earliest first: every start on the step grid
 * inside the working day that a block of `durationMinutes` fits into with
 * nothing already booked across it. A window that starts mid-day begins at
 * the next step; a window that ends mid-day ends there.
 */
export function openSlots(search: SlotSearch): OpenSlot[] {
	const from = Date.parse(search.from);
	const to = Date.parse(search.to);
	const duration = search.durationMinutes * MINUTE;
	const step = search.stepMinutes * MINUTE;
	if (
		!Number.isFinite(from) ||
		!Number.isFinite(to) ||
		to <= from ||
		duration <= 0 ||
		step <= 0 ||
		search.limit <= 0
	) {
		return [];
	}

	const slots: OpenSlot[] = [];
	// Walk the window a local day at a time, from the day `from` falls in.
	let cursor = partsIn(from, search.timeZone);
	let dayStart = instantOf(cursor.year, cursor.month, cursor.day, 0, 0, search.timeZone);
	// A guard against a zone that could not be read: no day advances, no loop.
	let guard = 0;

	while (dayStart < to && guard++ < 400) {
		const local = partsIn(dayStart, search.timeZone);
		if (!(search.weekdaysOnly && isWeekend(local.weekday))) {
			const open = instantOf(
				local.year,
				local.month,
				local.day,
				search.dayStartHour,
				0,
				search.timeZone
			);
			const close = instantOf(
				local.year,
				local.month,
				local.day,
				search.dayEndHour,
				0,
				search.timeZone
			);
			// The first candidate: the day's opening, or the next step after
			// the window starts when that is later.
			let start = Math.max(open, from);
			if (start > open) start = open + Math.ceil((start - open) / step) * step;
			for (; start + duration <= Math.min(close, to); start += step) {
				if (isTaken(start, start + duration, search.busy)) continue;
				slots.push({
					startsAt: new Date(start).toISOString(),
					endsAt: new Date(start + duration).toISOString()
				});
				if (slots.length >= search.limit) return slots;
			}
		}
		// The next local midnight: a day past this one's noon, then back to midnight.
		cursor = partsIn(dayStart + 36 * 60 * MINUTE, search.timeZone);
		dayStart = instantOf(cursor.year, cursor.month, cursor.day, 0, 0, search.timeZone);
	}

	return slots;
}
