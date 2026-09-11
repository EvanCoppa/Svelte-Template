import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { unwrap } from '$lib/server/crm/unwrap';
import { listStaff, type StaffMember } from '$lib/server/staff';

/**
 * Data access for the platform area's organization pages.
 *
 * Reads go through the request-scoped client (`locals.supabase`), exactly
 * like the tenant modules: an operator's `private.org_role()` answers
 * 'owner' for every organization (the system_admins migration), so RLS
 * already shows them the whole platform and no service-role client is
 * needed to look. What RLS does NOT grant is the write: `tier_id` is
 * revoked from `authenticated` by column grant (the organizations
 * migration), so `setOrganizationTier()` takes the admin client the action
 * creates for it — the one mutation this area has, and the only place a
 * service-role client appears under `$lib/server/admin`.
 *
 * Every function names its target organization explicitly. There is no
 * active org here: the platform area never reads the tenant cookie, and
 * never writes it.
 */

/** One row of the organizations directory. */
export type AdminOrganization = {
	id: string;
	name: string;
	createdAt: string;
	tierId: string;
	tierName: string;
	industryId: string;
	industryName: string;
	memberCount: number;
};

/** An organization as the read-only detail page shows it. */
export type AdminOrganizationDetail = AdminOrganization & {
	members: StaffMember[];
	/** Per-org escape hatches, operator-written (SQL / service role) — shown, never edited here. */
	overrides: { featureId: string; mode: string }[];
	/** Feature ids the org switched off itself, at /settings/features. */
	disabledFeatures: string[];
};

/**
 * The whole platform, by name. The tier and industry come back in the same
 * round trip, and the member count as an embedded aggregate — the
 * organization_members embed names its foreign key because several CRM
 * tables reference that table too, which would otherwise leave the
 * relationship ambiguous (PGRST201), the same disambiguation
 * `loadOrgContext()` makes.
 *
 * One unpaginated list, like the org switcher's: past PostgREST's max_rows
 * this page needs a search and a cursor instead — a scale this template
 * does not model.
 */
export async function listOrganizations(
	supabase: SupabaseClient<Database>
): Promise<AdminOrganization[]> {
	const rows = unwrap(
		await supabase
			.from('organizations')
			.select(
				'id, name, created_at, tier_id, industry_id, tiers(name), industries(name), organization_members!organization_members_org_id_fkey(count)'
			)
			.order('name')
	);
	return rows.map(describe);
}

/**
 * One organization with everything the detail page reads: its roster (the
 * same `listStaff()` the tenant staff page uses — one way to list an org's
 * members, and it already takes the org id explicitly), the operator
 * overrides on it and the features the org turned off itself. Null when no
 * such organization exists.
 */
export async function getOrganization(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<AdminOrganizationDetail | null> {
	const row = unwrap(
		await supabase
			.from('organizations')
			.select(
				'id, name, created_at, tier_id, industry_id, tiers(name), industries(name), organization_members!organization_members_org_id_fkey(count), organization_feature_overrides(feature_id, mode), organization_disabled_features(feature_id)'
			)
			.eq('id', orgId)
			.maybeSingle()
	);
	if (!row) return null;

	return {
		...describe(row),
		members: await listStaff(supabase, orgId),
		overrides: row.organization_feature_overrides.map((o) => ({
			featureId: o.feature_id,
			mode: o.mode
		})),
		disabledFeatures: row.organization_disabled_features.map((d) => d.feature_id)
	};
}

/**
 * The target of an admin action, or null when there is no such
 * organization. Deliberately light: an action needs to know that its target
 * exists and which plan it is leaving, not who works there. Read through
 * the request-scoped client, so "does it exist" is answered by the same RLS
 * that decides whether this caller may see it at all — the org-visibility
 * check the staff actions make, never a membership lookup.
 */
export async function findOrganization(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<{ id: string; name: string; tierId: string } | null> {
	const row = unwrap(
		await supabase.from('organizations').select('id, name, tier_id').eq('id', orgId).maybeSingle()
	);
	return row && { id: row.id, name: row.name, tierId: row.tier_id };
}

/**
 * Move one organization to one plan — the platform area's only write.
 *
 * Takes the service-role client because `organizations.tier_id` is
 * operator-owned: the column grants limit the browser to `name`, so this is
 * the tool the migration's closing comment describes, reached through a
 * server action that has already proved the caller is a system admin. The
 * update is scoped to the one id, selects the row back so a vanished
 * organization is an error rather than a silent success, and returns
 * nothing — the page re-reads.
 */
export async function setOrganizationTier(
	admin: SupabaseClient<Database>,
	orgId: string,
	tierId: string
): Promise<void> {
	const row = unwrap(
		await admin
			.from('organizations')
			.update({ tier_id: tierId })
			.eq('id', orgId)
			.select('id')
			.maybeSingle()
	);
	if (!row) throw new Error('That organization no longer exists.');
}

/** The shared columns of both queries, flattened the one way. */
function describe(row: {
	id: string;
	name: string;
	created_at: string;
	tier_id: string;
	industry_id: string;
	tiers: { name: string };
	industries: { name: string };
	organization_members: { count: number }[];
}): AdminOrganization {
	return {
		id: row.id,
		name: row.name,
		createdAt: row.created_at,
		tierId: row.tier_id,
		tierName: row.tiers.name,
		industryId: row.industry_id,
		industryName: row.industries.name,
		memberCount: row.organization_members[0]?.count ?? 0
	};
}
