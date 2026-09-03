import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import { ensure, unwrap, unwrapDeleted } from './crm/unwrap';

/**
 * Data access for the staff page: the org's member roster and its pending
 * invites. Same contract as the crm modules — every function takes the
 * request-scoped client (`locals.supabase`) plus the active org id, and RLS
 * decides visibility: anyone with staff `read` sees the roster, only staff
 * managers (`manage`, or owner/admin) can see or touch invites, and removing
 * a member takes staff `delete` (or owner/admin). Gate the buttons with
 * `can()` for UX; the policies are the boundary when someone reaches an
 * action anyway.
 *
 * The two `accept*` functions are the exception: they run on behalf of a
 * user who is NOT yet a member (so RLS would show them nothing) and take the
 * service-role client, created per request by the /invite/[token] route —
 * the same pattern as crm/notifications. Everything they write is derived
 * server-side from the token lookup, never from client input.
 */

export type Invite = Tables<'organization_invites'>;

/** One roster row: the membership joined with identity and held roles. */
export type StaffMember = {
	userId: string;
	role: Enums<'org_role'>;
	joinedAt: string;
	displayName: string | null;
	email: string | null;
	avatarUrl: string | null;
	roles: { id: string; name: string }[];
};

/**
 * The full roster, one round trip: memberships with the profile (via the
 * organization_members → profiles FK) and each member's role assignments.
 * Sorted by display name for stable rendering.
 */
export async function listStaff(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<StaffMember[]> {
	const rows = unwrap(
		await supabase
			.from('organization_members')
			.select(
				'user_id, role, created_at, profiles(display_name, email, avatar_url), member_roles(roles(id, name))'
			)
			.eq('org_id', orgId)
	);

	return rows
		.map(({ user_id, role, created_at, profiles: profile, member_roles }) => ({
			userId: user_id,
			role,
			joinedAt: created_at,
			displayName: profile.display_name,
			email: profile.email,
			avatarUrl: profile.avatar_url,
			roles: member_roles.map(({ roles: r }) => ({ id: r.id, name: r.name }))
		}))
		.sort((a, b) => (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? ''));
}

/** Pending invites, newest first. RLS returns rows to staff managers only. */
export async function listInvites(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<Invite[]> {
	return unwrap(
		await supabase
			.from('organization_invites')
			.select('*')
			.eq('org_id', orgId)
			.order('created_at', { ascending: false })
	);
}

/**
 * Create an invite: a personal one when `email` is given (replacing any
 * pending invite for that address, so the old link dies), or a shareable
 * link invite when null. The token and expiry are database-generated;
 * `invited_by` defaults to the caller.
 */
export async function createInvite(
	supabase: SupabaseClient<Database>,
	orgId: string,
	email: string | null
): Promise<Invite> {
	const normalized = email?.trim().toLowerCase() || null;
	if (normalized) {
		ensure(
			await supabase
				.from('organization_invites')
				.delete()
				.eq('org_id', orgId)
				.eq('email', normalized)
		);
	}
	return unwrap(
		await supabase
			.from('organization_invites')
			.insert({ org_id: orgId, email: normalized })
			.select()
			.single()
	);
}

export async function revokeInvite(
	supabase: SupabaseClient<Database>,
	orgId: string,
	inviteId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('organization_invites')
			.delete()
			.eq('org_id', orgId)
			.eq('id', inviteId)
			.select('id'),
		'Invite'
	);
}

/**
 * Remove a member from the org. RLS backs the UI gate: owners remove anyone,
 * admins remove non-owners, staff `delete` holders remove plain members —
 * anything else deletes zero rows and throws here.
 */
export async function removeMember(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('organization_members')
			.delete()
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.select('id:user_id'),
		'Member'
	);
}

/**
 * The caller's own membership context for an org — what form actions use to
 * rebuild `UserAccess` (loads get the same values from layout data instead),
 * plus the org name an invite email needs. Null when the caller is not a
 * member of the org at all.
 */
export async function getMembership(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string
): Promise<{ role: Enums<'org_role'>; industryId: string; orgName: string } | null> {
	const row = unwrap(
		await supabase
			.from('organization_members')
			// The org embed names its foreign key: member_roles, deals, tasks,
			// tickets and notifications all reference both tables, so a bare
			// `organizations(...)` is ambiguous to PostgREST (PGRST201) and every
			// action on this page would 500. Same hint as `loadOrgContext()`.
			.select('role, organizations!organization_members_org_id_fkey(name, industry_id)')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.maybeSingle()
	);
	return row
		? { role: row.role, industryId: row.organizations.industry_id, orgName: row.organizations.name }
		: null;
}

/** The link an invite email or the copy button hands out. */
export function inviteUrl(origin: string, token: string): string {
	return `${origin}/invite/${token}`;
}

/** What the accept page can find behind a token. */
export type InviteLookup =
	| { status: 'invalid' }
	| { status: 'expired'; orgName: string }
	| { status: 'wrong_email'; orgName: string }
	| { status: 'already_member'; orgId: string; orgName: string }
	| { status: 'ok'; orgId: string; orgName: string; inviteId: string };

/**
 * Resolve an invite token for the signed-in user about to accept it.
 * Service-role client: the caller is not a member yet, so their own client
 * would see neither the invite nor the org. A personal invite only matches
 * the address it was sent to; a link invite (null email) matches anyone.
 */
export async function lookupInvite(
	admin: SupabaseClient<Database>,
	token: string,
	user: { id: string; email: string | null }
): Promise<InviteLookup> {
	const invite = unwrap(
		await admin
			.from('organization_invites')
			.select('id, org_id, email, expires_at, organizations(name)')
			.eq('token', token)
			.maybeSingle()
	);
	if (!invite) return { status: 'invalid' };

	const orgName = invite.organizations.name;
	if (new Date(invite.expires_at).getTime() < Date.now()) {
		return { status: 'expired', orgName };
	}
	if (invite.email && invite.email !== user.email?.toLowerCase()) {
		return { status: 'wrong_email', orgName };
	}

	const membership = unwrap(
		await admin
			.from('organization_members')
			.select('user_id')
			.eq('org_id', invite.org_id)
			.eq('user_id', user.id)
			.maybeSingle()
	);
	if (membership) return { status: 'already_member', orgId: invite.org_id, orgName };

	return { status: 'ok', orgId: invite.org_id, orgName, inviteId: invite.id };
}

/** What the accept action should do about a token it just resolved. */
export type Acceptance =
	| { action: 'join'; orgId: string; inviteId: string }
	| { action: 'open'; orgId: string }
	| { action: 'refuse'; message: string };

/**
 * The accept action's decision, kept pure so it is testable without a
 * database: an existing member is simply sent to their org, and every
 * unusable invite gets one message — an accepting user learns nothing about
 * whether a token exists, only that this one will not work for them.
 */
export function acceptanceFor(invite: InviteLookup): Acceptance {
	switch (invite.status) {
		case 'ok':
			return { action: 'join', orgId: invite.orgId, inviteId: invite.inviteId };
		case 'already_member':
			return { action: 'open', orgId: invite.orgId };
		default:
			return { action: 'refuse', message: 'This invitation is no longer valid.' };
	}
}

/**
 * Consume an invite: create the membership (as a plain member — promotion is
 * a separate owner/admin act on the roster) and delete the invite row, which
 * is what makes invites single-use. The upsert tolerates the accept-twice
 * race instead of erroring on the unique membership key.
 */
export async function acceptInvite(
	admin: SupabaseClient<Database>,
	invite: { orgId: string; inviteId: string },
	userId: string
): Promise<void> {
	ensure(
		await admin
			.from('organization_members')
			.upsert(
				{ org_id: invite.orgId, user_id: userId, role: 'member' },
				{ onConflict: 'org_id,user_id', ignoreDuplicates: true }
			)
	);
	ensure(await admin.from('organization_invites').delete().eq('id', invite.inviteId));
}
