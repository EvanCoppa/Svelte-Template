import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { FeatureMode } from '$lib/features/types';
import { ORG_ID, supabaseMockSequence } from '$lib/server/crm/test-support';
import type { UserAccess } from '$lib/server/roles';
import { loadEmail } from './email.server';

/**
 * The record page's email block from the outside: for whom it exists, and
 * what it offers a reader who may write.
 */

vi.mock('$lib/server/mail-sync/config', () => ({
	isMailSyncConfigured: () => true,
	mailSyncConfig: () => null
}));

const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';

const OWNER: UserAccess = { role: 'owner', roles: [], grants: new Map() };
const READER: UserAccess = {
	role: 'member',
	roles: [],
	grants: new Map([['email', 'read' as const]])
};

function localsFor(
	supabase: SupabaseClient<Database>,
	access: UserAccess,
	mode: FeatureMode = 'enabled'
): App.Locals {
	// SAFETY: the load reads `supabase`, `activeOrgId`, `user.id` and
	// `org.{access,features,activeOrg.role}`; the rest of App.Locals is never touched.
	return {
		supabase,
		activeOrgId: ORG_ID,
		user: { id: USER_ID },
		org: {
			access,
			activeOrg: { role: access.role },
			features: {
				email: {
					mode,
					feature: {
						id: 'email',
						name: 'Emails',
						noun: 'email',
						description: null,
						route: '/email',
						icon: 'mail',
						category: 'crm',
						sort_order: 1150,
						created_at: '2026-01-01T00:00:00Z'
					}
				}
			}
		}
	} as never;
}

const mailboxRow = {
	id: 'a6000000-0000-0000-0000-000000000001',
	org_id: ORG_ID,
	user_id: USER_ID,
	provider: 'google',
	email_address: 'dev@example.com',
	visibility: 'shared',
	status: 'active',
	history_id: '1',
	watch_expires_at: null,
	backfilled_at: null,
	last_synced_at: null,
	last_error: null,
	created_at: '2026-09-01T00:00:00Z',
	updated_at: '2026-09-01T00:00:00Z'
};

describe('loadEmail', () => {
	it('is nothing for a kind that carries no mail', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: [] }]);
		expect(
			await loadEmail(localsFor(supabase, OWNER), { kind: 'products', id: CONTACT_ID })
		).toBeNull();
		expect(from).not.toHaveBeenCalled();
	});

	it('is nothing while the plan locks the feature', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: [] }]);
		expect(
			await loadEmail(localsFor(supabase, OWNER, 'locked_visible'), {
				kind: 'contacts',
				id: CONTACT_ID
			})
		).toBeNull();
		expect(from).not.toHaveBeenCalled();
	});

	it('offers a writer with a live mailbox the compose form, addressed to the record', async () => {
		const { supabase } = supabaseMockSequence([
			// the links filed on the contact: none
			{ data: [] },
			// the reader's own mailboxes
			{ data: [mailboxRow] },
			// the contact's address
			{ data: [{ email: 'lucius@wayne.example.com' }] }
		]);
		const email = await loadEmail(localsFor(supabase, OWNER), { kind: 'contacts', id: CONTACT_ID });
		expect(email).not.toBeNull();
		expect(email?.threads).toEqual([]);
		expect(email?.mailboxes).toEqual([{ id: mailboxRow.id, emailAddress: 'dev@example.com' }]);
		expect(email?.canSend).toBe(true);
		expect(email?.canConnect).toBe(false);
		expect(email?.composeForm.data.to).toBe('lucius@wayne.example.com');
		expect(email?.composeForm.data.mailbox_id).toBe(mailboxRow.id);
		expect(email?.composeForm.data.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
		expect(email?.isOrgManager).toBe(true);
	});

	it('invites a writer with no mailbox to connect one', async () => {
		const { supabase } = supabaseMockSequence([{ data: [] }, { data: [] }, { data: [] }]);
		const email = await loadEmail(localsFor(supabase, OWNER), {
			kind: 'companies',
			id: CONTACT_ID
		});
		expect(email?.canSend).toBe(false);
		expect(email?.canConnect).toBe(true);
	});

	it('lets a reader read and nothing more', async () => {
		const { supabase, from } = supabaseMockSequence([{ data: [] }]);
		const email = await loadEmail(localsFor(supabase, READER), {
			kind: 'contacts',
			id: CONTACT_ID
		});
		expect(email?.canSend).toBe(false);
		expect(email?.canConnect).toBe(false);
		expect(email?.isOrgManager).toBe(false);
		// No mailbox or address lookups for someone who cannot write.
		expect(from).toHaveBeenCalledTimes(1);
	});
});
