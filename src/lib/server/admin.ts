import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import type { FeatureMode } from '$lib/features/types';
import { ensure, unwrap, unwrapDeleted } from './crm/unwrap';

/**
 * Data access for the operator console (/admin).
 *
 * Every function takes the SERVICE-ROLE client that `requireOperator()`
 * hands out. These tables are reference data with no client write path —
 * that is the point: an org can never change its own plan, industry or
 * catalog — so the console writes the way an operator's SQL would. RLS is
 * not the boundary here; `requireOperator()` is, which is why nothing may
 * reach these helpers without it. Reads that already exist elsewhere (the
 * registry, the role catalog, an org's opt-outs) are reused from their own
 * modules — they take any client.
 *
 * The `diff*` helpers are pure: an action turns the posted state and the
 * current rows into the smallest set of writes, so a save touches only
 * what changed and a half-failed save leaves the rest intact.
 */

type Db = SupabaseClient<Database>;

/** Which keys to add and which to drop to turn one set into another. */
export type SetDiff = { add: string[]; remove: string[] };

/** Which entries to write (new or changed) and which keys to drop to turn one map into another. */
export type MapDiff<V> = { upsert: [key: string, value: V][]; remove: string[] };

export function diffSets(current: Iterable<string>, wanted: Iterable<string>): SetDiff {
	const have = new Set(current);
	const want = new Set(wanted);
	return {
		add: [...want].filter((key) => !have.has(key)),
		remove: [...have].filter((key) => !want.has(key))
	};
}

export function diffMaps<V>(
	current: ReadonlyMap<string, V>,
	wanted: ReadonlyMap<string, V>
): MapDiff<V> {
	return {
		upsert: [...wanted].filter(([key, value]) => current.get(key) !== value),
		remove: [...current.keys()].filter((key) => !wanted.has(key))
	};
}

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

export async function listIndustries(db: Db): Promise<Tables<'industries'>[]> {
	return unwrap(await db.from('industries').select('*').order('name'));
}

export async function listTiers(db: Db): Promise<Tables<'tiers'>[]> {
	return unwrap(await db.from('tiers').select('*').order('name'));
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/** The columns an operator may edit; id and route are the contract with the code. */
export type FeatureCatalogEdit = Pick<
	Tables<'features'>,
	'id' | 'name' | 'description' | 'icon' | 'category' | 'sort_order'
>;

export async function updateFeatureCatalog(db: Db, rows: FeatureCatalogEdit[]): Promise<void> {
	for (const { id, ...patch } of rows) {
		ensure(await db.from('features').update(patch).eq('id', id));
	}
}

export type PairDiff = { add: [featureId: string, otherId: string][]; remove: [string, string][] };

export async function setIndustryFeatures(db: Db, { add, remove }: PairDiff): Promise<void> {
	if (add.length > 0) {
		ensure(
			await db
				.from('industry_features')
				.insert(add.map(([feature_id, industry_id]) => ({ feature_id, industry_id })))
		);
	}
	for (const [feature_id, industry_id] of remove) {
		ensure(
			await db
				.from('industry_features')
				.delete()
				.eq('feature_id', feature_id)
				.eq('industry_id', industry_id)
		);
	}
}

export async function setTierFeatures(db: Db, { add, remove }: PairDiff): Promise<void> {
	if (add.length > 0) {
		ensure(
			await db
				.from('tier_features')
				.insert(add.map(([feature_id, tier_id]) => ({ feature_id, tier_id })))
		);
	}
	for (const [feature_id, tier_id] of remove) {
		ensure(
			await db.from('tier_features').delete().eq('feature_id', feature_id).eq('tier_id', tier_id)
		);
	}
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function createRole(
	db: Db,
	role: Pick<Tables<'roles'>, 'industry_id' | 'name' | 'description'>
): Promise<void> {
	ensure(await db.from('roles').insert(role));
}

/** Cascades to its grants and every member assignment. */
export async function deleteRole(db: Db, roleId: string): Promise<void> {
	unwrapDeleted(await db.from('roles').delete().eq('id', roleId).select('id'), 'Role');
}

export type RoleGrant = Pick<Tables<'role_permissions'>, 'role_id' | 'feature_id' | 'level'>;

export async function setRoleGrants(
	db: Db,
	{ upsert, remove }: { upsert: RoleGrant[]; remove: Pick<RoleGrant, 'role_id' | 'feature_id'>[] }
): Promise<void> {
	if (upsert.length > 0) {
		ensure(await db.from('role_permissions').upsert(upsert, { onConflict: 'role_id,feature_id' }));
	}
	for (const { role_id, feature_id } of remove) {
		ensure(
			await db.from('role_permissions').delete().eq('role_id', role_id).eq('feature_id', feature_id)
		);
	}
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export type AdminOrganization = {
	id: string;
	name: string;
	tierId: string;
	tierName: string;
	industryId: string;
	industryName: string;
	memberCount: number;
	createdAt: string;
};

export async function listOrganizations(db: Db): Promise<AdminOrganization[]> {
	const rows = unwrap(
		await db
			.from('organizations')
			.select(
				'id, name, tier_id, industry_id, created_at, tiers(name), industries(name), organization_members(user_id)'
			)
			.order('name')
	);
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		tierId: row.tier_id,
		tierName: row.tiers.name,
		industryId: row.industry_id,
		industryName: row.industries.name,
		memberCount: row.organization_members.length,
		createdAt: row.created_at
	}));
}

/** An override may force any mode but `disabled` — that one is the org's own choice. */
export type OverrideMode = Exclude<FeatureMode, 'disabled'>;

export type AdminMember = {
	userId: string;
	role: Enums<'org_role'>;
	displayName: string | null;
	email: string | null;
	roles: { id: string; name: string }[];
};

export type AdminOrganizationDetail = {
	id: string;
	name: string;
	tierId: string;
	industryId: string;
	overrides: { feature_id: string; mode: OverrideMode; note: string | null }[];
	/** Feature ids the org switched off itself. */
	disabled: string[];
	members: AdminMember[];
};

export async function getOrganization(
	db: Db,
	orgId: string
): Promise<AdminOrganizationDetail | null> {
	const row = unwrap(
		await db
			.from('organizations')
			.select(
				'id, name, tier_id, industry_id, organization_feature_overrides(feature_id, mode, note), organization_disabled_features(feature_id), organization_members(user_id, role, profiles(display_name, email), member_roles(roles(id, name)))'
			)
			.eq('id', orgId)
			.maybeSingle()
	);
	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		tierId: row.tier_id,
		industryId: row.industry_id,
		overrides: row.organization_feature_overrides.flatMap(({ feature_id, mode, note }) =>
			// The table's check constraint already forbids 'disabled'; the filter
			// is what narrows the generated enum for the type.
			mode === 'disabled' ? [] : [{ feature_id, mode, note }]
		),
		disabled: row.organization_disabled_features.map((d) => d.feature_id),
		members: row.organization_members
			.map(({ user_id, role, profiles: profile, member_roles }) => ({
				userId: user_id,
				role,
				displayName: profile.display_name,
				email: profile.email,
				roles: member_roles.map(({ roles: r }) => ({ id: r.id, name: r.name }))
			}))
			.sort((a, b) =>
				(a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? '')
			)
	};
}

export async function updateOrganizationPlan(
	db: Db,
	orgId: string,
	plan: Pick<Tables<'organizations'>, 'tier_id' | 'industry_id'>
): Promise<void> {
	ensure(await db.from('organizations').update(plan).eq('id', orgId));
}

export async function setFeatureOverrides(
	db: Db,
	orgId: string,
	{ upsert, remove }: { upsert: { feature_id: string; mode: OverrideMode }[]; remove: string[] }
): Promise<void> {
	if (upsert.length > 0) {
		ensure(
			await db.from('organization_feature_overrides').upsert(
				upsert.map((o) => ({ org_id: orgId, ...o })),
				{ onConflict: 'org_id,feature_id' }
			)
		);
	}
	if (remove.length > 0) {
		ensure(
			await db
				.from('organization_feature_overrides')
				.delete()
				.eq('org_id', orgId)
				.in('feature_id', remove)
		);
	}
}

export async function setMemberOrgRole(
	db: Db,
	orgId: string,
	userId: string,
	role: Enums<'org_role'>
): Promise<void> {
	ensure(
		await db.from('organization_members').update({ role }).eq('org_id', orgId).eq('user_id', userId)
	);
}
