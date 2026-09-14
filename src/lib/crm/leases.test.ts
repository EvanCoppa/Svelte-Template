import { describe, expect, it } from 'vitest';
import { coversDay, leaseStateOn } from './leases';

const TODAY = '2026-09-12';

/** A term, as the columns hold it: two `date` strings, the end one nullable. */
function term(starts_on: string, ends_on: string | null = null) {
	return { starts_on, ends_on };
}

describe('leaseStateOn', () => {
	it('calls a lease that has not started yet upcoming', () => {
		expect(leaseStateOn(term('2026-10-01', '2027-09-30'), TODAY)).toBe('upcoming');
	});

	it('calls a lease with a future end date current', () => {
		expect(leaseStateOn(term('2025-10-01', '2026-09-30'), TODAY)).toBe('current');
	});

	// The reason there is no status column: this answer changes at midnight,
	// in whichever zone the reader is in, without anything being written.
	it('counts the last day of the term as still current, because ends_on is inclusive', () => {
		expect(leaseStateOn(term('2025-10-01', TODAY), TODAY)).toBe('current');
		expect(leaseStateOn(term('2025-10-01', '2026-09-11'), TODAY)).toBe('ended');
	});

	it('calls a term with no end date rolling — month-to-month, and what a holdover becomes', () => {
		expect(leaseStateOn(term('2025-10-01', null), TODAY)).toBe('rolling');
	});

	it('treats a lease starting today as started', () => {
		expect(leaseStateOn(term(TODAY, '2027-09-30'), TODAY)).toBe('current');
		expect(leaseStateOn(term(TODAY, null), TODAY)).toBe('rolling');
	});

	// The whole point of taking the date as an argument: the same row reads
	// differently to a reader in a different place, and the server never picks.
	it('is a question about the day it is asked, not about the row', () => {
		const holdover = term('2025-10-01', '2026-09-07');
		expect(leaseStateOn(holdover, '2026-09-07')).toBe('current');
		expect(leaseStateOn(holdover, '2026-09-08')).toBe('ended');
	});
});

describe('coversDay', () => {
	it('is true exactly while the tenancy is running', () => {
		const fixed = term('2026-01-01', '2026-12-31');
		expect(coversDay(fixed, '2025-12-31')).toBe(false);
		expect(coversDay(fixed, '2026-01-01')).toBe(true);
		expect(coversDay(fixed, '2026-12-31')).toBe(true);
		expect(coversDay(fixed, '2027-01-01')).toBe(false);
	});

	it('keeps covering a month-to-month tenancy indefinitely', () => {
		expect(coversDay(term('2026-01-01', null), '2099-01-01')).toBe(true);
	});

	// A unit with no lease covering a day is on short-term that day — which is
	// how the two revenue shapes fall out of one table rather than two.
	it('lets a gap between leases read as short-term', () => {
		const first = term('2026-01-01', '2026-06-30');
		const next = term('2026-08-01', '2027-07-31');
		const gap = '2026-07-15';
		expect(coversDay(first, gap) || coversDay(next, gap)).toBe(false);
	});
});
