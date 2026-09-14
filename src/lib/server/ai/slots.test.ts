import { describe, expect, it } from 'vitest';
import { openSlots, type SlotSearch } from './slots';

/**
 * Free time is found in one zone, on a step grid, around what is already
 * booked. New York is the fixture zone because its offset differs from UTC
 * and changes across the year, which is what a wall-clock search has to get
 * right.
 */

const search = (overrides: Partial<SlotSearch> = {}): SlotSearch => ({
	// Tue 8 Sep 2026 00:00 to Wed 9 Sep 2026 00:00, New York (EDT, UTC-4).
	from: '2026-09-08T04:00:00.000Z',
	to: '2026-09-09T04:00:00.000Z',
	busy: [],
	durationMinutes: 60,
	timeZone: 'America/New_York',
	dayStartHour: 9,
	dayEndHour: 17,
	weekdaysOnly: true,
	stepMinutes: 30,
	limit: 100,
	...overrides
});

describe('openSlots', () => {
	it('offers the working day on the step grid, in the zone asked for', () => {
		const slots = openSlots(search({ stepMinutes: 60 }));
		expect(slots).toHaveLength(8);
		// 9:00 EDT is 13:00Z; the last hour-long slot starts at 16:00 EDT.
		expect(slots[0]).toEqual({
			startsAt: '2026-09-08T13:00:00.000Z',
			endsAt: '2026-09-08T14:00:00.000Z'
		});
		expect(slots.at(-1)).toEqual({
			startsAt: '2026-09-08T20:00:00.000Z',
			endsAt: '2026-09-08T21:00:00.000Z'
		});
	});

	it('steps over what is booked, reading ends_at as exclusive', () => {
		const slots = openSlots(
			search({
				stepMinutes: 60,
				// 10:00–12:00 EDT is taken.
				busy: [{ startsAt: '2026-09-08T14:00:00.000Z', endsAt: '2026-09-08T16:00:00.000Z' }]
			})
		);
		const starts = slots.map((slot) => slot.startsAt.slice(11, 16));
		expect(starts).toEqual(['13:00', '16:00', '17:00', '18:00', '19:00', '20:00']);
	});

	it('begins at the next step when the window opens mid-day, and stops at the cap', () => {
		const slots = openSlots(
			search({
				// 10:10 EDT.
				from: '2026-09-08T14:10:00.000Z',
				limit: 2
			})
		);
		expect(slots.map((slot) => slot.startsAt)).toEqual([
			'2026-09-08T14:30:00.000Z',
			'2026-09-08T15:00:00.000Z'
		]);
	});

	it('skips the weekend unless asked not to', () => {
		// Sat 12 Sep to Mon 14 Sep 2026, New York.
		const weekend = { from: '2026-09-12T04:00:00.000Z', to: '2026-09-14T04:00:00.000Z' };
		expect(openSlots(search(weekend))).toEqual([]);
		expect(openSlots(search({ ...weekend, weekdaysOnly: false }))).not.toEqual([]);
	});

	it('reads the working day on the right side of a daylight-saving change', () => {
		// Mon 9 Nov 2026 — New York is on EST (UTC-5) after the 1 Nov change.
		const slots = openSlots(
			search({
				from: '2026-11-09T05:00:00.000Z',
				to: '2026-11-10T05:00:00.000Z',
				stepMinutes: 60,
				limit: 1
			})
		);
		expect(slots[0]?.startsAt).toBe('2026-11-09T14:00:00.000Z');
	});

	it('answers nothing for a window it cannot read', () => {
		expect(openSlots(search({ from: 'never', to: 'ever' }))).toEqual([]);
		expect(openSlots(search({ to: '2026-09-08T04:00:00.000Z' }))).toEqual([]);
	});
});
