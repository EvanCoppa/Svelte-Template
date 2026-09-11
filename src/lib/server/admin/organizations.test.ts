import { describe, expect, it } from 'vitest';
import {
	findOrganization,
	getOrganization,
	listOrganizations,
	setOrganizationTier
} from './organizations';
import { ORG_ID, supabaseMock, supabaseTablesMock } from '../crm/test-support';

/** An organizations row as both queries select it. */
type OrgRow = {
	id: string;
	name: string;
	created_at: string;
	tier_id: string;
	industry_id: string;
	tiers: { name: string };
	industries: { name: string };
	organization_members: { count: number }[];
	organization_feature_overrides?: { feature_id: string; mode: string }[];
	organization_disabled_features?: { feature_id: string }[];
};

function orgRow(overrides: Partial<OrgRow> = {}): OrgRow {
	return {
		id: ORG_ID,
		name: 'Acme Inc',
		created_at: '2026-01-02T03:04:05Z',
		tier_id: 'pro',
		industry_id: 'dentistry',
		tiers: { name: 'Pro' },
		industries: { name: 'Dentistry' },
		organization_members: [{ count: 3 }],
		...overrides
	};
}

describe('listOrganizations', () => {
	it('lists the whole platform by name, flattening tier, industry and member count', async () => {
		const { supabase, from, builder } = supabaseMock({ data: [orgRow()] });

		await expect(listOrganizations(supabase)).resolves.toEqual([
			{
				id: ORG_ID,
				name: 'Acme Inc',
				createdAt: '2026-01-02T03:04:05Z',
				tierId: 'pro',
				tierName: 'Pro',
				industryId: 'dentistry',
				industryName: 'Dentistry',
				memberCount: 3
			}
		]);
		expect(from).toHaveBeenCalledWith('organizations');
		expect(builder.order).toHaveBeenCalledWith('name');
	});

	it('names the foreign key on the members embed, which is otherwise ambiguous', async () => {
		// Several CRM tables reference organization_members too, so a bare
		// embed is PGRST201 — the disambiguation loadOrgContext() also makes.
		const { supabase, builder } = supabaseMock({ data: [] });

		await listOrganizations(supabase);

		expect(builder.select).toHaveBeenCalledWith(
			expect.stringContaining('organization_members!organization_members_org_id_fkey(count)')
		);
	});

	it('reads a member count of zero when the aggregate comes back empty', async () => {
		const { supabase } = supabaseMock({ data: [orgRow({ organization_members: [] })] });

		await expect(listOrganizations(supabase)).resolves.toMatchObject([{ memberCount: 0 }]);
	});
});

describe('getOrganization', () => {
	it('composes the roster, the operator overrides and the org’s own opt-outs', async () => {
		const { supabase, builders } = supabaseTablesMock({
			organizations: {
				data: orgRow({
					organization_feature_overrides: [{ feature_id: 'assistant', mode: 'enabled' }],
					organization_disabled_features: [{ feature_id: 'tickets' }]
				})
			},
			organization_members: {
				data: [
					{
						user_id: 'u1',
						role: 'owner',
						created_at: '2026-01-02T00:00:00Z',
						profiles: { display_name: 'Ada', email: 'ada@example.test', avatar_url: null },
						member_roles: []
					}
				]
			}
		});

		const org = await getOrganization(supabase, ORG_ID);

		expect(org).toMatchObject({
			id: ORG_ID,
			tierName: 'Pro',
			industryName: 'Dentistry',
			overrides: [{ featureId: 'assistant', mode: 'enabled' }],
			disabledFeatures: ['tickets']
		});
		// The roster is the staff module's, not a second members query.
		expect(org?.members).toMatchObject([{ userId: 'u1', displayName: 'Ada', role: 'owner' }]);
		expect(builders['organizations']?.eq).toHaveBeenCalledWith('id', ORG_ID);
	});

	it('answers null for an id that names no organization', async () => {
		const { supabase } = supabaseTablesMock({ organizations: { data: null } });

		await expect(getOrganization(supabase, ORG_ID)).resolves.toBeNull();
	});
});

describe('findOrganization', () => {
	it('reads just enough to validate an action’s target', async () => {
		const { supabase, builder } = supabaseMock({
			data: { id: ORG_ID, name: 'Acme Inc', tier_id: 'free' }
		});

		await expect(findOrganization(supabase, ORG_ID)).resolves.toEqual({
			id: ORG_ID,
			name: 'Acme Inc',
			tierId: 'free'
		});
		expect(builder.select).toHaveBeenCalledWith('id, name, tier_id');
	});

	it('answers null when RLS shows the caller no such organization', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(findOrganization(supabase, ORG_ID)).resolves.toBeNull();
	});
});

describe('setOrganizationTier', () => {
	it('moves the one organization named, and nothing else', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: ORG_ID } });

		await expect(setOrganizationTier(supabase, ORG_ID, 'enterprise')).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('organizations');
		expect(builder.update).toHaveBeenCalledWith({ tier_id: 'enterprise' });
		expect(builder.eq).toHaveBeenCalledWith('id', ORG_ID);
	});

	it('throws rather than reporting success when no row came back', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(setOrganizationTier(supabase, ORG_ID, 'pro')).rejects.toThrow('no longer exists');
	});
});
