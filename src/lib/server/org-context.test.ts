import { describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { loadOrgContext } from './org-context';
import { ORG_ID, supabaseTablesMock } from './crm/test-support';

const USER_ID = '00000000-0000-0000-0000-000000000002';
const GLOBEX_ID = '10000000-0000-0000-0000-000000000002';

const registry = [
	{
		id: 'clients',
		name: 'Clients',
		description: null,
		route: '/clients',
		icon: 'users',
		category: 'platform',
		sort_order: 10,
		created_at: '',
		industry_features: [{ industry_id: 'general' }, { industry_id: 'construction' }],
		tier_features: [{ tier_id: 'free' }, { tier_id: 'pro' }]
	},
	{
		id: 'deals',
		name: 'Deals',
		description: null,
		route: '/deals',
		icon: 'handshake',
		category: 'platform',
		sort_order: 20,
		created_at: '',
		industry_features: [{ industry_id: 'general' }],
		tier_features: [{ tier_id: 'pro' }]
	}
];

/**
 * An organizations row as the loader selects it: the org with its tier and
 * feature rows, plus the caller's own membership embedded — empty when RLS
 * showed them the org without one (only a system admin ever sees that).
 */
function orgRow(
	role: 'owner' | 'admin' | 'member' | null,
	org: { id: string; name: string; tier: string; industry: string },
	rows: { overrides?: { feature_id: string; mode: string }[]; disabled?: string[] } = {}
) {
	return {
		id: org.id,
		name: org.name,
		tier_id: org.tier,
		industry_id: org.industry,
		tiers: { name: org.tier[0].toUpperCase() + org.tier.slice(1) },
		organization_feature_overrides: rows.overrides ?? [],
		organization_disabled_features: (rows.disabled ?? []).map((feature_id) => ({ feature_id })),
		organization_members: role ? [{ role }] : []
	};
}

const acme = { id: ORG_ID, name: 'Acme Inc', tier: 'pro', industry: 'general' };
const globex = { id: GLOBEX_ID, name: 'Globex', tier: 'free', industry: 'construction' };

function harness({
	organizations,
	cookieOrgId = null,
	heldRoles = [],
	systemAdmin = false
}: {
	organizations: ReturnType<typeof orgRow>[];
	cookieOrgId?: string | null;
	heldRoles?: unknown[];
	systemAdmin?: boolean;
}) {
	const { supabase, from, builders } = supabaseTablesMock({
		organizations: { data: organizations },
		features: { data: registry },
		member_roles: { data: heldRoles },
		system_admins: { data: systemAdmin ? { user_id: USER_ID } : null }
	});
	const cookies = { set: vi.fn() };
	const locals = { supabase, user: { id: USER_ID }, activeOrgId: cookieOrgId };
	// SAFETY: the loader reads locals.supabase/user/activeOrgId and cookies.set;
	// nothing else on RequestEvent is touched.
	const event = { locals, cookies } as never;
	return { event, from, builders, cookies, locals };
}

describe('loadOrgContext', () => {
	it('resolves the cookie org, its features and a member’s grants', async () => {
		const h = harness({
			organizations: [orgRow('member', acme, { disabled: ['deals'] }), orgRow('owner', globex)],
			cookieOrgId: ORG_ID,
			heldRoles: [
				{
					roles: {
						id: 'r1',
						name: 'Support',
						role_permissions: [{ feature_id: 'clients', level: 'read' }]
					}
				}
			]
		});

		const ctx = await loadOrgContext(h.event);
		expect(ctx.organizations.map((o) => o.name)).toEqual(['Acme Inc', 'Globex']);
		expect(ctx.activeOrg).toMatchObject({
			id: ORG_ID,
			role: 'member',
			tierId: 'pro',
			tierName: 'Pro'
		});
		expect(ctx.features.clients.mode).toBe('enabled');
		expect(ctx.features.deals.mode).toBe('disabled');
		expect(ctx.access.grants).toEqual(new Map([['clients', 'read']]));
		expect(h.from).toHaveBeenCalledWith('member_roles');
		expect(h.builders.member_roles.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		// Cookie already matched: nothing to repair.
		expect(h.cookies.set).not.toHaveBeenCalled();
	});

	it('embeds only the caller’s own membership, naming the foreign key', async () => {
		const h = harness({ organizations: [orgRow('owner', acme)] });

		await loadOrgContext(h.event);
		// Several tables reference both organizations and organization_members,
		// so a bare embed is ambiguous to PostgREST (PGRST201) and every page
		// would answer 500.
		expect(h.builders.organizations.select).toHaveBeenCalledWith(
			expect.stringContaining('organization_members!organization_members_org_id_fkey(role)')
		);
		expect(h.builders.organizations.eq).toHaveBeenCalledWith(
			'organization_members.user_id',
			USER_ID
		);
	});

	it('repairs a stale cookie and the locals copy on the same request', async () => {
		const h = harness({
			organizations: [orgRow('owner', acme)],
			cookieOrgId: '99999999-0000-0000-0000-000000000000'
		});

		const ctx = await loadOrgContext(h.event);
		expect(ctx.activeOrg.id).toBe(ORG_ID);
		expect(h.cookies.set).toHaveBeenCalledWith('app-active-org', ORG_ID, expect.anything());
		expect(h.locals.activeOrgId).toBe(ORG_ID);
	});

	it('builds owner and admin access without a roles query', async () => {
		for (const role of ['owner', 'admin'] as const) {
			const h = harness({ organizations: [orgRow(role, acme)] });

			const ctx = await loadOrgContext(h.event);
			expect(ctx.access).toEqual({ role, roles: [], grants: new Map() });
			expect(h.from).not.toHaveBeenCalledWith('member_roles');
		}
	});

	it('resolves the active org’s own overrides, not another membership’s', async () => {
		const h = harness({
			organizations: [
				orgRow('member', acme, { overrides: [{ feature_id: 'deals', mode: 'hidden' }] }),
				orgRow('owner', globex, { overrides: [{ feature_id: 'deals', mode: 'enabled' }] })
			],
			cookieOrgId: GLOBEX_ID
		});

		const ctx = await loadOrgContext(h.event);
		expect(ctx.activeOrg.id).toBe(GLOBEX_ID);
		// Outside construction and the free tier, yet enabled by the pilot override.
		expect(ctx.features.deals.mode).toBe('enabled');
		expect(ctx.features.clients.mode).toBe('enabled');
	});

	it('makes a system admin the owner of every org RLS shows them', async () => {
		// A plain member of Acme, never invited to Globex — RLS shows an
		// operator both, and private.org_role() answers 'owner' for each.
		const h = harness({
			organizations: [orgRow('member', acme), orgRow(null, globex)],
			cookieOrgId: GLOBEX_ID,
			systemAdmin: true
		});

		const ctx = await loadOrgContext(h.event);
		expect(ctx.organizations.map((o) => [o.name, o.role])).toEqual([
			['Acme Inc', 'owner'],
			['Globex', 'owner']
		]);
		expect(ctx.activeOrg.id).toBe(GLOBEX_ID);
		expect(ctx.access).toEqual({ role: 'owner', roles: [], grants: new Map() });
		expect(h.from).toHaveBeenCalledWith('system_admins');
		expect(h.builders.system_admins.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(h.from).not.toHaveBeenCalledWith('member_roles');
	});

	it('lands an operator with no cookie in an org they belong to', async () => {
		// 'AAA Corp' sorts first but the operator never joined it; their real
		// membership (Acme) is the fallback, while the switcher lists both.
		const aaa = {
			id: '10000000-0000-0000-0000-000000000099',
			name: 'AAA Corp',
			tier: 'free',
			industry: 'general'
		};
		const h = harness({
			organizations: [orgRow('member', acme), orgRow(null, aaa)],
			systemAdmin: true
		});

		const ctx = await loadOrgContext(h.event);
		expect(ctx.organizations.map((o) => o.name)).toEqual(['AAA Corp', 'Acme Inc']);
		expect(ctx.activeOrg.id).toBe(ORG_ID);
		expect(h.cookies.set).toHaveBeenCalledWith('app-active-org', ORG_ID, expect.anything());
	});

	it('drops an org that reaches a non-operator without a membership row', async () => {
		// Cannot happen under the organizations policy; if it ever did, the org
		// must not be handed a role it was never given.
		const h = harness({ organizations: [orgRow('member', acme), orgRow(null, globex)] });

		const ctx = await loadOrgContext(h.event);
		expect(ctx.organizations.map((o) => o.name)).toEqual(['Acme Inc']);
	});

	it('fails closed with a 500 when organizations cannot be loaded', async () => {
		const { supabase } = supabaseTablesMock({
			organizations: { error: { message: 'boom' } },
			features: { data: registry }
		});
		const event = {
			locals: { supabase, user: { id: USER_ID }, activeOrgId: null },
			cookies: { set: vi.fn() }
		};

		// SAFETY: see harness() — the loader touches nothing else on the event.
		await expect(loadOrgContext(event as never)).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 500
		);
	});

	it('fails closed with a 500 when the registry cannot be loaded', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { supabase } = supabaseTablesMock({
			organizations: { data: [orgRow('owner', acme)] },
			features: { error: { message: 'boom' } }
		});
		const event = {
			locals: { supabase, user: { id: USER_ID }, activeOrgId: null },
			cookies: { set: vi.fn() }
		};

		// SAFETY: see harness() — the loader touches nothing else on the event.
		await expect(loadOrgContext(event as never)).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 500
		);
	});

	it('fails closed with a 500 when the operator lookup fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { supabase } = supabaseTablesMock({
			organizations: { data: [orgRow('owner', acme)] },
			features: { data: registry },
			system_admins: { error: { message: 'boom' } }
		});
		const event = {
			locals: { supabase, user: { id: USER_ID }, activeOrgId: null },
			cookies: { set: vi.fn() }
		};

		// SAFETY: see harness() — the loader touches nothing else on the event.
		await expect(loadOrgContext(event as never)).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 500
		);
	});

	it('refuses a user with no organization at all', async () => {
		const h = harness({ organizations: [] });

		await expect(loadOrgContext(h.event)).rejects.toSatisfy(
			(e) => isHttpError(e) && e.status === 500 && e.body.message.includes('no organization')
		);
	});
});
