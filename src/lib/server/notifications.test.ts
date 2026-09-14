import { describe, expect, it } from 'vitest';
import { supabaseMockSequence, ORG_ID } from './crm/test-support';
import {
	ARCHIVED_NOTIFICATION_LIMIT,
	loadInbox,
	notificationColumns,
	OPEN_NOTIFICATION_LIMIT,
	requireActiveOrg
} from './notifications';

describe('what the shell loads for the bell', () => {
	it('fetches the two piles separately, each with its own cap', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: [{ id: 'open' }] },
			{ data: [{ id: 'archived' }] }
		]);

		const rows = await loadInbox(supabase, ORG_ID);

		// Open first, then archived: the panel splits them again by pile, so
		// the only thing this order has to preserve is newest-first inside each.
		expect(rows).toEqual([{ id: 'open' }, { id: 'archived' }]);
		expect(builder.is).toHaveBeenCalledWith('archived_at', null);
		expect(builder.not).toHaveBeenCalledWith('archived_at', 'is', null);
		expect(builder.limit).toHaveBeenCalledWith(OPEN_NOTIFICATION_LIMIT);
		expect(builder.limit).toHaveBeenCalledWith(ARCHIVED_NOTIFICATION_LIMIT);
	});

	it('keeps the archived window tighter than the open one', () => {
		expect(ARCHIVED_NOTIFICATION_LIMIT).toBeLessThan(OPEN_NOTIFICATION_LIMIT);
	});
});

describe('which inbox an endpoint is acting on', () => {
	it('is the active-org cookie', () => {
		expect(requireActiveOrg(ORG_ID)).toBe(ORG_ID);
	});

	it('refuses rather than guessing when there is no active org', () => {
		expect(() => requireActiveOrg(null)).toThrow();
	});
});

describe('a patch as columns', () => {
	it('writes only what the browser sent', () => {
		expect(notificationColumns({ read: true })).toEqual({ read_at: expect.any(String) });
		expect(Object.keys(notificationColumns({ read: true }))).toEqual(['read_at']);
	});

	it('turns each boolean into the timestamp its column keeps', () => {
		expect(notificationColumns({ read: false })).toEqual({ read_at: null });
		expect(notificationColumns({ archived: false })).toEqual({ archived_at: null });
	});

	it('marks a dismissed notification read in the same write', () => {
		const columns = notificationColumns({ archived: true });
		expect(columns.archived_at).toEqual(expect.any(String));
		// Otherwise restoring one would put it straight back in the badge.
		expect(columns.read_at).toEqual(columns.archived_at);
	});

	it('does not un-read a notification that is only being restored', () => {
		expect(notificationColumns({ archived: false })).not.toHaveProperty('read_at');
	});
});
