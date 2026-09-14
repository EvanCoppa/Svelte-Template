import { describe, expect, it } from 'vitest';
import {
	clearFeatureOverride,
	findOrganization,
	getOrganization,
	listOrganizations,
	renameOrganization,
	setFeatureOverride,
	setOrganizationIndustry,
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
	organization_feature_overrides?: { feature_id: string; mode: string; note: string | null }[];
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
					organization_feature_overrides: [
						{ feature_id: 'assistant', mode: 'enabled', note: null }
					],
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
			overrides: [{ featureId: 'assistant', mode: 'enabled', note: null }],
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

	it('carries each override’s note, in a stable order', async () => {
		// The note is the only record of WHY an override exists until there is
		// an audit table, so it has to survive the read — and the rows come
		// back in a fixed order so the page does not reshuffle between loads.
		const { supabase } = supabaseTablesMock({
			organizations: {
				data: orgRow({
					organization_feature_overrides: [
						{ feature_id: 'deals', mode: 'hidden', note: 'Churned to a lite plan' },
						{ feature_id: 'assistant', mode: 'enabled', note: 'Pilot until Q3' }
					],
					organization_disabled_features: []
				})
			},
			organization_members: { data: [] }
		});

		const org = await getOrganization(supabase, ORG_ID);

		expect(org?.overrides).toEqual([
			{ featureId: 'assistant', mode: 'enabled', note: 'Pilot until Q3' },
			{ featureId: 'deals', mode: 'hidden', note: 'Churned to a lite plan' }
		]);
	});
});

describe('findOrganization', () => {
	it('reads just enough to validate an action’s target', async () => {
		const { supabase, builder } = supabaseMock({
			data: { id: ORG_ID, name: 'Acme Inc', tier_id: 'free', industry_id: 'crm' }
		});

		// Enough to validate the target and to say in the log what it left:
		// the plan and the vertical it was on before the write.
		await expect(findOrganization(supabase, ORG_ID)).resolves.toEqual({
			id: ORG_ID,
			name: 'Acme Inc',
			tierId: 'free',
			industryId: 'crm'
		});
		expect(builder.select).toHaveBeenCalledWith('id, name, tier_id, industry_id');
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

describe('renameOrganization', () => {
	/**
	 * The one platform write that does not take the service-role client, and
	 * the test says why: `name` is the single column `authenticated` may
	 * update (the organizations migration's column grants) and an operator is
	 * 'owner' everywhere, so the caller's own client carries it and RLS stays
	 * in the path.
	 */
	it('renames the one organization named, and nothing else', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: ORG_ID } });

		await expect(renameOrganization(supabase, ORG_ID, 'Globex')).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('organizations');
		expect(builder.update).toHaveBeenCalledWith({ name: 'Globex' });
		expect(builder.eq).toHaveBeenCalledWith('id', ORG_ID);
	});

	it('throws rather than reporting success when no row came back', async () => {
		// Which is also what RLS refusing the write looks like from here.
		const { supabase } = supabaseMock({ data: null });

		await expect(renameOrganization(supabase, ORG_ID, 'Globex')).rejects.toThrow(
			'no longer exists'
		);
	});
});

describe('setOrganizationIndustry', () => {
	it('moves the one organization named to the vertical asked for', async () => {
		const { supabase, from, builder } = supabaseMock({ data: { id: ORG_ID } });

		await expect(setOrganizationIndustry(supabase, ORG_ID, 'dentistry')).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('organizations');
		expect(builder.update).toHaveBeenCalledWith({ industry_id: 'dentistry' });
		expect(builder.eq).toHaveBeenCalledWith('id', ORG_ID);
	});

	it('throws rather than reporting success when no row came back', async () => {
		const { supabase } = supabaseMock({ data: null });

		await expect(setOrganizationIndustry(supabase, ORG_ID, 'dentistry')).rejects.toThrow(
			'no longer exists'
		);
	});
});

describe('setFeatureOverride', () => {
	/**
	 * An upsert on the table's own primary key: setting a mode twice is the
	 * same as setting it once, so re-picking a mode rewrites the row instead
	 * of colliding.
	 */
	it('upserts on (org_id, feature_id) so a re-pick replaces the row', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });

		await expect(
			setFeatureOverride(supabase, ORG_ID, 'deals', 'enabled', 'Pilot until Q3')
		).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('organization_feature_overrides');
		expect(builder.upsert).toHaveBeenCalledWith(
			{ org_id: ORG_ID, feature_id: 'deals', mode: 'enabled', note: 'Pilot until Q3' },
			{ onConflict: 'org_id,feature_id' }
		);
	});

	it('stores a missing note as null — the column means nothing was said', async () => {
		const { supabase, builder } = supabaseMock({ data: null });

		await setFeatureOverride(supabase, ORG_ID, 'deals', 'hidden', null);
		expect(builder.upsert).toHaveBeenCalledWith(
			expect.objectContaining({ note: null }),
			expect.anything()
		);
	});

	it('surfaces a refused write rather than swallowing it', async () => {
		const { supabase } = supabaseMock({ error: { message: 'violates check constraint' } });

		await expect(setFeatureOverride(supabase, ORG_ID, 'deals', 'enabled', null)).rejects.toThrow(
			'violates check constraint'
		);
	});
});

describe('clearFeatureOverride', () => {
	it('deletes the one row, scoped to both halves of its key', async () => {
		const { supabase, from, builder } = supabaseMock({ data: null });

		await expect(clearFeatureOverride(supabase, ORG_ID, 'deals')).resolves.toBeUndefined();
		expect(from).toHaveBeenCalledWith('organization_feature_overrides');
		expect(builder.eq).toHaveBeenCalledWith('org_id', ORG_ID);
		expect(builder.eq).toHaveBeenCalledWith('feature_id', 'deals');
	});
});
