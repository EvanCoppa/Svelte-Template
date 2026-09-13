/**
 * The pure half of leases — client-safe, like `$lib/crm/ledger.ts` and
 * `$lib/crm/billables.ts`. `$lib/server/crm/leases.ts` reads the rows; this
 * is what anyone may ask about one.
 *
 * **A lease has no status column** (the properties_and_leases migration,
 * decision 2). Whether one is upcoming, running or finished is a question
 * about a day, and a day is a wall-clock word — so it is answered here, by a
 * function that takes the date as an argument, and the pages pass the
 * viewer's own (`localDate(new Date())`). That is the rule the ledger's
 * "overdue" and the task board's "today" already follow: nothing on the
 * server decides what now means.
 */

/** What a lease covers, relative to some day. */
export type LeaseTerm = { starts_on: string; ends_on: string | null };

/**
 *   upcoming  signed, not started
 *   current   running, with a fixed end date still ahead
 *   rolling   running month-to-month (`ends_on` null) — also what a holdover
 *             becomes once someone re-papers it
 *   ended     the last day it covered has passed
 */
export type LeaseState = 'upcoming' | 'current' | 'rolling' | 'ended';

/**
 * Where a lease sits relative to `today` (an ISO `YYYY-MM-DD`, compared as
 * the `date` columns are — lexicographic order is chronological order).
 *
 * `ends_on` is INCLUSIVE — the last day the tenancy covers — which is why a
 * lease ending today reads `current` and not `ended`. That is deliberately
 * unlike `calendar_events.ends_at`, an exclusive instant: an event is a block
 * of time, a lease is a set of days a human names.
 */
export function leaseStateOn(lease: LeaseTerm, today: string): LeaseState {
	if (lease.starts_on > today) return 'upcoming';
	if (lease.ends_on === null) return 'rolling';
	return lease.ends_on < today ? 'ended' : 'current';
}

/** Whether a lease covers a given day — the rent roll's "is this unit let". */
export function coversDay(lease: LeaseTerm, day: string): boolean {
	const state = leaseStateOn(lease, day);
	return state === 'current' || state === 'rolling';
}

/**
 * What a lease is called. It has no name column, because neither half of
 * the answer is the lease's to own — it is named for what is rented and by
 * whom. One function, so the record page's heading, the graph's node and a
 * related-records row never disagree.
 */
export function leaseName(lease: { property?: string | null; tenant?: string | null }): string {
	return [lease.property, lease.tenant].filter(Boolean).join(' — ') || 'Lease';
}
