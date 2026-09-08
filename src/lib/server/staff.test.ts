import { describe, expect, it } from 'vitest';
import {
	acceptInvite,
	acceptanceFor,
	createInvite,
	inviteUrl,
	listInvites,
	listStaff,
	lookupInvite,
	removeMember,
	revokeInvite
} from './staff';
import { ORG_ID, supabaseMock, supabaseMockSequence } from './crm/test-support';

const USER_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000003';
const INVITE_ID = 'e0000000-0000-0000-0000-000000000001';

const rosterRow = (
	userId: string,
	displayName: string | null,
	extra: Partial<{ email: string | null; roles: { id: string; name: string }[] }> = {}
) => ({
	user_id: userId,
	role: 'member',
	created_at: '2026-01-01T00:00:00Z',
	profiles: {
		display_name: displayName,
		email: extra.email ?? `${displayName ?? 'x'}@example.com`,
		avatar_url: null
	},
	member_roles: (extra.roles ?? []).map((r) => ({ roles: r }))
});

describe('listStaff', () => {
	it('flattens the membership, profile and role embeds into roster rows', async () => {
		const { supabase, from, builder } = supabaseMock({
			data: [
				rosterRow(USER_ID, 'Zoe', { roles: [{ id: 'r1', name: 'Support' }] }),
				rosterRow(OTHER_USER_ID, 'Adam')
			]
		});

		const staff = await listStaff(supabase, ORG_ID);
		expect(from).toHaveBeenCalledWith('organization_members');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// Sorted by display name, so Adam precedes Zoe.
		expect(staff.map((m) => m.displayName)).toEqual(['Adam', 'Zoe']);
		expect(staff[1]).toMatchObject({
			userId: USER_ID,
			role: 'member',
			email: 'Zoe@example.com',
			roles: [{ id: 'r1', name: 'Support' }]
		});
	});

	it('sorts members with no display name by email instead of crashing', async () => {
		const { supabase } = supabaseMock({
			data: [
				rosterRow(USER_ID, null, { email: 'zed@example.com' }),
				rosterRow(OTHER_USER_ID, 'Ann')
			]
		});

		const staff = await listStaff(supabase, ORG_ID);
		expect(staff.map((m) => m.email)).toEqual(['Ann@example.com', 'zed@example.com']);
	});
});

describe('listInvites', () => {
	it('reads the org’s invites newest first', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [] });

		await listInvites(supabase, ORG_ID);
		expect(from).toHaveBeenCalledWith('organization_invites');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
	});
});

describe('createInvite', () => {
	it('normalizes the address and replaces any pending invite for it', async () => {
		const { supabase, builder } = supabaseMockSequence([
			{ data: null },
			{ data: { id: INVITE_ID, email: 'new@example.com' } }
		]);

		const invite = await createInvite(supabase, ORG_ID, '  New@Example.com ');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('email', 'new@example.com');
		expect(builder.insert).toHaveBeenCalledWith({ org_id: ORG_ID, email: 'new@example.com' });
		expect(invite.id).toBe(INVITE_ID);
	});

	it('creates a link invite with a null email and deletes nothing', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: INVITE_ID, email: null } });

		await createInvite(supabase, ORG_ID, null);
		expect(builder.delete).not.toHaveBeenCalled();
		expect(builder.insert).toHaveBeenCalledWith({ org_id: ORG_ID, email: null });
	});

	it('treats a blank email as a link invite', async () => {
		const { supabase, builder } = supabaseMock({ data: { id: INVITE_ID, email: null } });

		await createInvite(supabase, ORG_ID, '   ');
		expect(builder.delete).not.toHaveBeenCalled();
		expect(builder.insert).toHaveBeenCalledWith({ org_id: ORG_ID, email: null });
	});
});

describe('revokeInvite and removeMember', () => {
	it('revokes with evidence, throwing when RLS matched nothing', async () => {
		const { supabase, builder } = supabaseMock({ data: [{ id: INVITE_ID }] });

		await revokeInvite(supabase, ORG_ID, INVITE_ID);
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('id', INVITE_ID);

		const empty = supabaseMock({ data: [] });
		await expect(revokeInvite(empty.supabase, ORG_ID, INVITE_ID)).rejects.toThrow(
			'Invite was not deleted'
		);
	});

	it('removes a member with evidence, throwing when RLS refused', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [{ id: USER_ID }] });

		await removeMember(supabase, ORG_ID, USER_ID);
		expect(from).toHaveBeenCalledWith('organization_members');
		expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID);

		const empty = supabaseMock({ data: [] });
		await expect(removeMember(empty.supabase, ORG_ID, USER_ID)).rejects.toThrow(
			'Member was not deleted'
		);
	});
});

describe('inviteUrl', () => {
	it('builds the accept link from the app origin and token', () => {
		expect(inviteUrl('https://app.test', 'tok123')).toBe('https://app.test/invite/tok123');
	});
});

describe('lookupInvite', () => {
	const user = { id: USER_ID, email: 'invitee@example.com' };
	const invite = (overrides: Partial<{ email: string | null; expires_at: string }> = {}) => ({
		id: INVITE_ID,
		org_id: ORG_ID,
		email: null,
		expires_at: '2099-01-01T00:00:00Z',
		organizations: { name: 'Acme Inc' },
		...overrides
	});

	it('reports an unknown token as invalid', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		expect(await lookupInvite(supabase, 'nope', user)).toEqual({ status: 'invalid' });
		expect(builder.eq).toHaveBeenCalledWith('token', 'nope');
	});

	it('reports an expired invite', async () => {
		const { supabase } = supabaseMock({ data: invite({ expires_at: '2020-01-01T00:00:00Z' }) });

		expect(await lookupInvite(supabase, 'tok', user)).toEqual({
			status: 'expired',
			orgName: 'Acme Inc'
		});
	});

	it('refuses a personal invite presented by a different address', async () => {
		const { supabase } = supabaseMock({ data: invite({ email: 'someone@example.com' }) });

		expect(await lookupInvite(supabase, 'tok', user)).toEqual({
			status: 'wrong_email',
			orgName: 'Acme Inc'
		});
	});

	it('accepts a personal invite from the address it was sent to', async () => {
		const { supabase } = supabaseMockSequence([
			{ data: invite({ email: 'invitee@example.com' }) },
			{ data: null }
		]);

		expect(await lookupInvite(supabase, 'tok', user)).toEqual({
			status: 'ok',
			orgId: ORG_ID,
			orgName: 'Acme Inc',
			inviteId: INVITE_ID
		});
	});

	it('lets a link invite through for anyone signed in', async () => {
		const { supabase } = supabaseMockSequence([{ data: invite() }, { data: null }]);

		expect(await lookupInvite(supabase, 'tok', { id: USER_ID, email: null })).toMatchObject({
			status: 'ok'
		});
	});

	it('reports an existing membership instead of joining twice', async () => {
		const { supabase } = supabaseMockSequence([{ data: invite() }, { data: { user_id: USER_ID } }]);

		expect(await lookupInvite(supabase, 'tok', user)).toEqual({
			status: 'already_member',
			orgId: ORG_ID,
			orgName: 'Acme Inc'
		});
	});
});

describe('acceptanceFor', () => {
	it('joins on a usable invite, carrying the ids the write needs', () => {
		expect(
			acceptanceFor({ status: 'ok', orgId: ORG_ID, orgName: 'Acme Inc', inviteId: INVITE_ID })
		).toEqual({ action: 'join', orgId: ORG_ID, inviteId: INVITE_ID });
	});

	it('opens the org for someone who already belongs to it', () => {
		expect(acceptanceFor({ status: 'already_member', orgId: ORG_ID, orgName: 'Acme Inc' })).toEqual(
			{
				action: 'open',
				orgId: ORG_ID
			}
		);
	});

	it('refuses every unusable invite with one indistinguishable message', () => {
		// An unknown token and a real-but-expired one must read identically, or
		// the accept form becomes an oracle for which tokens exist.
		const refusals = [
			acceptanceFor({ status: 'invalid' }),
			acceptanceFor({ status: 'expired', orgName: 'Acme Inc' }),
			acceptanceFor({ status: 'wrong_email', orgName: 'Acme Inc' })
		];
		expect(refusals).toEqual([
			{ action: 'refuse', message: 'This invitation is no longer valid.' },
			{ action: 'refuse', message: 'This invitation is no longer valid.' },
			{ action: 'refuse', message: 'This invitation is no longer valid.' }
		]);
	});
});

describe('acceptInvite', () => {
	it('creates the membership as a plain member, then consumes the invite', async () => {
		const { supabase, from, builder } = supabaseMockSequence([{ data: null }, { data: null }]);

		await acceptInvite(supabase, { orgId: ORG_ID, inviteId: INVITE_ID }, USER_ID);
		expect(from).toHaveBeenNthCalledWith(1, 'organization_members');
		expect(builder.upsert).toHaveBeenCalledWith(
			{ org_id: ORG_ID, user_id: USER_ID, role: 'member' },
			{ onConflict: 'org_id,user_id', ignoreDuplicates: true }
		);
		expect(from).toHaveBeenNthCalledWith(2, 'organization_invites');
		expect(builder.eq).toHaveBeenCalledWith('id', INVITE_ID);
	});

	it('throws when the membership write fails', async () => {
		const { supabase } = supabaseMockSequence([{ error: { message: 'nope' } }]);

		await expect(
			acceptInvite(supabase, { orgId: ORG_ID, inviteId: INVITE_ID }, USER_ID)
		).rejects.toThrow('nope');
	});
});
