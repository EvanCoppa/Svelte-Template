import { describe, expect, it } from 'vitest';
import {
	allDaySlot,
	compactTime,
	dayKey,
	exclusiveEndAfter,
	fetchWindow,
	formatWhen,
	fromLocalDateTimeInput,
	hourLabel,
	inclusiveEndDate,
	isBanner,
	isCalendarView,
	layoutDay,
	layoutRow,
	relativeDayLabel,
	minutesAtY,
	monthGrid,
	movedToDay,
	overflowCount,
	parseDayKey,
	rangeLabel,
	resizedTo,
	shiftAnchor,
	shifted,
	snapMinutes,
	startOfWeek,
	timedSlot,
	toLocalDateTimeInput,
	visibleDays,
	visibleRange,
	type GridEvent
} from './calendar';

/**
 * Every date below is built with the local constructor, so the expectations
 * hold in whatever zone the test runs in — the calendar is a wall-clock
 * instrument, and so are its tests. `fetchWindow` is the exception: it works
 * in UTC by design and is checked against UTC.
 */

/** Wednesday, 9 September 2026 — a Wednesday in every zone. */
const WEDNESDAY = new Date(2026, 8, 9);

let counter = 0;
function event(
	start: Date,
	end: Date,
	fields: Partial<Omit<GridEvent, 'starts_at' | 'ends_at'>> = {}
): GridEvent {
	counter += 1;
	return {
		id: `e1000000-0000-0000-0000-${String(counter).padStart(12, '0')}`,
		title: `Event ${counter}`,
		starts_at: start.toISOString(),
		ends_at: end.toISOString(),
		all_day: false,
		color: 'info',
		...fields
	};
}

const at = (day: Date, hours: number, minutes = 0) =>
	new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
const days = (from: Date, n: number) =>
	new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);

describe('days', () => {
	it('starts the week on Monday', () => {
		expect(dayKey(startOfWeek(WEDNESDAY))).toBe('2026-09-07');
		expect(dayKey(startOfWeek(new Date(2026, 8, 7)))).toBe('2026-09-07');
		expect(dayKey(startOfWeek(new Date(2026, 8, 13)))).toBe('2026-09-07');
	});

	it('round-trips a day key and refuses anything that is not a day', () => {
		expect(parseDayKey('2026-09-09')?.getTime()).toBe(WEDNESDAY.getTime());
		expect(parseDayKey('2026-02-30')).toBeNull();
		expect(parseDayKey('tomorrow')).toBeNull();
		expect(parseDayKey(null)).toBeNull();
	});

	it('knows the views', () => {
		expect(isCalendarView('week')).toBe(true);
		expect(isCalendarView('agenda')).toBe(false);
		expect(isCalendarView(null)).toBe(false);
	});
});

describe('the visible grid', () => {
	it('pads a month to whole weeks, Monday first', () => {
		const rows = monthGrid(WEDNESDAY);
		expect(rows).toHaveLength(5);
		expect(dayKey(rows[0][0])).toBe('2026-08-31');
		expect(dayKey(rows[4][6])).toBe('2026-10-04');
	});

	it('grows to six rows when a month needs them', () => {
		// August 2026 starts on a Saturday and has 31 days: 5 + 31 cells is six rows.
		expect(monthGrid(new Date(2026, 7, 1))).toHaveLength(6);
	});

	it('shows seven days for a week and one for a day', () => {
		expect(visibleDays('week', WEDNESDAY).map(dayKey)).toEqual([
			'2026-09-07',
			'2026-09-08',
			'2026-09-09',
			'2026-09-10',
			'2026-09-11',
			'2026-09-12',
			'2026-09-13'
		]);
		expect(visibleDays('day', WEDNESDAY).map(dayKey)).toEqual(['2026-09-09']);
	});

	it('ends the range the day after the last cell', () => {
		const { start, end } = visibleRange('week', WEDNESDAY);
		expect(dayKey(start)).toBe('2026-09-07');
		expect(dayKey(end)).toBe('2026-09-14');
	});

	it('steps by month, week or day', () => {
		expect(dayKey(shiftAnchor('month', WEDNESDAY, 1))).toBe('2026-10-01');
		expect(dayKey(shiftAnchor('month', new Date(2026, 0, 31), 1))).toBe('2026-02-01');
		expect(dayKey(shiftAnchor('week', WEDNESDAY, -1))).toBe('2026-09-02');
		expect(dayKey(shiftAnchor('day', WEDNESDAY, 1))).toBe('2026-09-10');
	});

	it('names the span on screen', () => {
		expect(rangeLabel('month', WEDNESDAY)).toBe('September 2026');
		expect(rangeLabel('week', WEDNESDAY)).toBe('Sep 7 – 13, 2026');
		expect(rangeLabel('week', new Date(2026, 8, 1))).toBe('Aug 31 – Sep 6, 2026');
		expect(rangeLabel('week', new Date(2026, 0, 1))).toBe('Dec 29, 2025 – Jan 4, 2026');
		expect(rangeLabel('day', WEDNESDAY)).toBe('Wednesday, September 9, 2026');
	});
});

describe('fetchWindow', () => {
	const today = new Date('2026-09-09T15:00:00Z');

	it('pads a week by two days each side, in UTC', () => {
		expect(fetchWindow('week', '2026-09-09', today)).toEqual({
			from: '2026-09-05T00:00:00.000Z',
			to: '2026-09-16T00:00:00.000Z'
		});
	});

	it('pads a month past both padded weeks', () => {
		expect(fetchWindow('month', '2026-09-15', today)).toEqual({
			from: '2026-08-24T00:00:00.000Z',
			to: '2026-10-16T00:00:00.000Z'
		});
	});

	it('falls back to today for a missing or malformed key', () => {
		expect(fetchWindow('day', null, today)).toEqual({
			from: '2026-09-07T00:00:00.000Z',
			to: '2026-09-12T00:00:00.000Z'
		});
		expect(fetchWindow('day', '2026-13-99', today)).toEqual(fetchWindow('day', null, today));
	});

	it("pads a whole period each side when the day on screen is the viewer's, not the URL's", () => {
		// Sunday evening in Los Angeles is already Monday in UTC: the viewer draws
		// the week before the server's, and it has to be in the window.
		expect(fetchWindow('week', null, new Date('2026-09-14T03:00:00Z'))).toEqual({
			from: '2026-09-05T00:00:00.000Z',
			to: '2026-09-30T00:00:00.000Z'
		});
		// A viewer can be a month behind UTC or a month ahead of it (Sydney is
		// already on the 1st while UTC is on the 30th), so both neighbours are in.
		expect(fetchWindow('month', null, new Date('2026-10-01T02:00:00Z'))).toEqual({
			from: '2026-08-24T00:00:00.000Z',
			to: '2026-12-16T00:00:00.000Z'
		});
	});
});

describe('banners', () => {
	it('is a banner when all-day or when it crosses midnight', () => {
		expect(isBanner(event(at(WEDNESDAY, 9), at(WEDNESDAY, 10)))).toBe(false);
		expect(isBanner(event(at(WEDNESDAY, 23), at(WEDNESDAY, 24)))).toBe(false);
		expect(isBanner(event(at(WEDNESDAY, 23), at(days(WEDNESDAY, 1), 1)))).toBe(true);
		expect(isBanner(event(at(WEDNESDAY, 0), at(days(WEDNESDAY, 1), 0), { all_day: true }))).toBe(
			true
		);
	});
});

describe('layoutRow', () => {
	const week = visibleDays('week', WEDNESDAY);

	it('spans a multi-day bar across its columns and flags the open ends', () => {
		const long = event(at(days(week[0], -1), 0), at(days(week[0], 2), 0), { all_day: true });
		const [segment] = layoutRow([long], week);
		expect(segment).toMatchObject({
			startCol: 0,
			endCol: 2,
			lane: 0,
			banner: true,
			continuesBefore: true,
			continuesAfter: false
		});
	});

	it('keeps banners above the day chips and packs lanes greedily', () => {
		const bar = event(at(week[1], 0), at(week[4], 0), { all_day: true, title: 'Offsite' });
		const monday = event(at(week[0], 9), at(week[0], 10), { title: 'Stand-up' });
		const tuesday = event(at(week[1], 10), at(week[1], 11), { title: 'Review' });
		const segments = layoutRow([tuesday, monday, bar], week);
		const lane = (title: string) => segments.find((s) => s.event.title === title)?.lane;

		expect(lane('Offsite')).toBe(0);
		// Monday is free under the bar's row, so its chip takes the top lane.
		expect(lane('Stand-up')).toBe(0);
		// Tuesday sits under the bar.
		expect(lane('Review')).toBe(1);
	});

	it('counts what a column cannot show', () => {
		const rows = [9, 10, 11, 12].map((hour) => event(at(week[2], hour), at(week[2], hour + 1)));
		const segments = layoutRow(rows, week);
		expect(overflowCount(segments, 2, 2)).toBe(2);
		expect(overflowCount(segments, 3, 2)).toBe(0);
	});

	it('leaves out what does not touch the row', () => {
		expect(layoutRow([event(at(days(week[6], 3), 9), at(days(week[6], 3), 10))], week)).toEqual([]);
	});
});

describe('layoutDay', () => {
	it('places a lone block at its minutes with the full width', () => {
		const [placed] = layoutDay([event(at(WEDNESDAY, 9, 30), at(WEDNESDAY, 11))], WEDNESDAY);
		expect(placed).toMatchObject({ top: 570, height: 90, column: 0, columns: 1 });
	});

	it('splits overlapping blocks into tracks and shares the count across the cluster', () => {
		const a = event(at(WEDNESDAY, 9), at(WEDNESDAY, 10, 30), { title: 'A' });
		const b = event(at(WEDNESDAY, 10), at(WEDNESDAY, 11), { title: 'B' });
		const c = event(at(WEDNESDAY, 10, 45), at(WEDNESDAY, 12), { title: 'C' });
		const alone = event(at(WEDNESDAY, 14), at(WEDNESDAY, 15), { title: 'D' });
		const placed = layoutDay([c, alone, b, a], WEDNESDAY);
		const by = (title: string) => placed.find((p) => p.event.title === title);

		expect(by('A')).toMatchObject({ column: 0, columns: 2 });
		expect(by('B')).toMatchObject({ column: 1, columns: 2 });
		// A has ended by 10:45, so C reuses its track — and stays in the cluster.
		expect(by('C')).toMatchObject({ column: 0, columns: 2 });
		expect(by('D')).toMatchObject({ column: 0, columns: 1 });
	});

	it('runs a block ending at midnight to the bottom, and ignores banners', () => {
		const late = event(at(WEDNESDAY, 23), at(days(WEDNESDAY, 1), 0));
		const allDay = event(at(WEDNESDAY, 0), at(days(WEDNESDAY, 1), 0), { all_day: true });
		const placed = layoutDay([late, allDay], WEDNESDAY);
		expect(placed).toHaveLength(1);
		expect(placed[0]).toMatchObject({ top: 1380, height: 60 });
	});

	it('gives a very short event the minimum height', () => {
		const [placed] = layoutDay([event(at(WEDNESDAY, 9), at(WEDNESDAY, 9, 5))], WEDNESDAY);
		expect(placed.height).toBe(15);
	});
});

describe('the pointer', () => {
	it('snaps to the grid and stays inside the day', () => {
		expect(snapMinutes(37)).toBe(30);
		expect(snapMinutes(38)).toBe(45);
		expect(snapMinutes(38, 'floor')).toBe(30);
		expect(snapMinutes(-10)).toBe(0);
		expect(snapMinutes(1500)).toBe(1440);
	});

	it('turns pixels into minutes at the shared hour height', () => {
		expect(minutesAtY(56)).toBe(60);
		expect(minutesAtY(28, 56)).toBe(30);
		expect(minutesAtY(-5)).toBe(0);
	});
});

describe('what a gesture writes', () => {
	const meeting = event(at(WEDNESDAY, 9), at(WEDNESDAY, 10, 30));

	it('moves by days then minutes, keeping the length', () => {
		const moved = shifted(meeting, 1, 45);
		expect(new Date(moved.starts_at).getTime()).toBe(at(days(WEDNESDAY, 1), 9, 45).getTime());
		expect(new Date(moved.ends_at).getTime()).toBe(at(days(WEDNESDAY, 1), 11, 15).getTime());
	});

	it('drops onto another day at the same time of day', () => {
		const moved = movedToDay(meeting, days(WEDNESDAY, 3));
		expect(new Date(moved.starts_at).getTime()).toBe(at(days(WEDNESDAY, 3), 9).getTime());
		expect(new Date(moved.ends_at).getTime()).toBe(at(days(WEDNESDAY, 3), 10, 30).getTime());
	});

	it('resizes to a new end, never shorter than the minimum', () => {
		expect(new Date(resizedTo(meeting, WEDNESDAY, 12 * 60).ends_at).getTime()).toBe(
			at(WEDNESDAY, 12).getTime()
		);
		expect(new Date(resizedTo(meeting, WEDNESDAY, 8 * 60).ends_at).getTime()).toBe(
			at(WEDNESDAY, 9, 15).getTime()
		);
	});

	it('books an hour from a click, and a midnight-to-midnight day', () => {
		const slot = timedSlot(WEDNESDAY, 10 * 60 + 15);
		expect(new Date(slot.starts_at).getTime()).toBe(at(WEDNESDAY, 10, 15).getTime());
		expect(new Date(slot.ends_at).getTime()).toBe(at(WEDNESDAY, 11, 15).getTime());

		const day = allDaySlot(WEDNESDAY);
		expect(new Date(day.starts_at).getTime()).toBe(at(WEDNESDAY, 0).getTime());
		expect(new Date(day.ends_at).getTime()).toBe(at(days(WEDNESDAY, 1), 0).getTime());
	});
});

describe('form inputs', () => {
	it('round-trips a datetime-local value through the browser zone', () => {
		const iso = at(WEDNESDAY, 14, 5).toISOString();
		expect(toLocalDateTimeInput(iso)).toBe('2026-09-09T14:05');
		expect(fromLocalDateTimeInput('2026-09-09T14:05')).toBe(iso);
		expect(fromLocalDateTimeInput('soon')).toBeNull();
	});

	it('shows an all-day event ending on its last day, not the midnight after', () => {
		const ends = at(days(WEDNESDAY, 2), 0).toISOString();
		expect(inclusiveEndDate(ends)).toBe('2026-09-10');
		expect(exclusiveEndAfter('2026-09-10')).toBe(ends);
		expect(exclusiveEndAfter('')).toBeNull();
	});
});

describe('words for times', () => {
	it('writes compact chip times', () => {
		expect(compactTime(at(WEDNESDAY, 9))).toBe('9am');
		expect(compactTime(at(WEDNESDAY, 9, 30))).toBe('9:30am');
		expect(compactTime(at(WEDNESDAY, 12))).toBe('12pm');
		expect(compactTime(at(WEDNESDAY, 0))).toBe('12am');
		expect(compactTime(at(WEDNESDAY, 13, 5))).toBe('1:05pm');
	});

	it('labels the hour gutter', () => {
		expect(hourLabel(0)).toBe('12 AM');
		expect(hourLabel(9)).toBe('9 AM');
		expect(hourLabel(12)).toBe('12 PM');
		expect(hourLabel(17)).toBe('5 PM');
	});

	it('names the days near today rather than dating them', () => {
		// The one place a date becomes "Tomorrow": the task list's due dates and
		// the deal board's expected close both read through it, so they cannot
		// word the same day two ways.
		const now = new Date(2026, 8, 15, 12, 0, 0);
		const day = (offset: number) => new Date(2026, 8, 15 + offset);

		expect(relativeDayLabel(day(0), now)).toBe('Today');
		expect(relativeDayLabel(day(1), now)).toBe('Tomorrow');
		expect(relativeDayLabel(day(-1), now)).toBe('Yesterday');
		expect(relativeDayLabel(day(-3), now)).toBe('3 days ago');
		// Inside the coming week a weekday is unambiguous and needs no date.
		expect(relativeDayLabel(day(5), now)).toBe('Sunday');
		expect(relativeDayLabel(day(6), now)).toBe('Monday');
		// A week out is NOT named: "Tuesday" is today's word too, and one word
		// for two different days is worse than a date.
		expect(relativeDayLabel(day(7), now)).toBe('Sep 22');
		expect(relativeDayLabel(day(8), now)).toBe('Sep 23');
	});

	it('says when an event is, in one line', () => {
		expect(formatWhen(event(at(WEDNESDAY, 9), at(WEDNESDAY, 10, 30)))).toBe(
			'Wednesday, September 9 · 9:00 AM – 10:30 AM'
		);
		expect(formatWhen(event(at(WEDNESDAY, 0), at(days(WEDNESDAY, 1), 0), { all_day: true }))).toBe(
			'Wednesday, September 9'
		);
		expect(formatWhen(event(at(WEDNESDAY, 0), at(days(WEDNESDAY, 3), 0), { all_day: true }))).toBe(
			'Wed, Sep 9 – Fri, Sep 11'
		);
		expect(formatWhen(event(at(WEDNESDAY, 23), at(days(WEDNESDAY, 1), 1)))).toBe(
			'Wed, Sep 9, 11:00 PM – Thu, Sep 10, 1:00 AM'
		);
	});
});
