import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '$lib/database.types';
import { ensure, unwrap } from '$lib/server/crm/unwrap';
import { listStaff, type StaffMember } from '$lib/server/staff';

/**
 * Data access for the platform area's organization pages.
 *
 * Reads go through the request-scoped client (`locals.supabase`), exactly
 * like the tenant modules: an operator's `private.org_role()` answers
 * 'owner' for every organization (the system_admins migration), so RLS
 * already shows them the whole platform and no service-role client is
 * needed to look.
 *
 * **Which client a write takes is decided by the grants, never by
 * convenience.** The organizations migration revokes insert/update from
 * `authenticated` and grants back `update (name)` only, so:
 *
 * - `renameOrganization()` takes the CALLER's client. An operator is
 *   'owner' on every org, the update policy accepts that, and the column
 *   grant allows `name` — so RLS is a real boundary here and there is no
 *   reason to step around it.
 * - `setOrganizationTier()` and `setOrganizationIndustry()` take the
 *   service-role client: those columns are operator-owned and no policy can
 *   let them through.
 * - `setFeatureOverride()` / `clearFeatureOverride()` take it too.
 *   `organization_feature_overrides` is the escape hatch its migration
 *   describes as "set by operators only": members may read their own org's
 *   rows and nothing more, so there is no write policy to satisfy.
 *
 * The rule the type signature enforces: a parameter named `admin` is a
 * service-role client and its function is reachable only from an action
 * that has already proved `requireSystemAdmin()`.
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

/**
 * One override row, as the organization's page lists and edits it. `mode` is
 * `feature_mode` minus 'disabled' — the table's check constraint reserves
 * that value for the org's own opt-out, which lives in
 * `organization_disabled_features` and is the organization's to set, never
 * an operator's.
 */
export type AdminFeatureOverride = {
	featureId: string;
	mode: OverrideMode;
	/** Why this override exists ("pilot until Q3"), for whoever finds it later. */
	note: string | null;
};

/** The three modes an operator may force. */
export type OverrideMode = Exclude<Enums<'feature_mode'>, 'disabled'>;

/** An organization as its detail page shows it. */
export type AdminOrganizationDetail = AdminOrganization & {
	members: StaffMember[];
	/** Per-org escape hatches: the operator's own override of the industry/tier answer. */
	overrides: AdminFeatureOverride[];
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
				'id, name, created_at, tier_id, industry_id, tiers(name), industries(name), organization_members!organization_members_org_id_fkey(count), organization_feature_overrides(feature_id, mode, note), organization_disabled_features(feature_id)'
			)
			.eq('id', orgId)
			.maybeSingle()
	);
	if (!row) return null;

	return {
		...describe(row),
		members: await listStaff(supabase, orgId),
		overrides: row.organization_feature_overrides
			.map((o) => ({
				featureId: o.feature_id,
				// SAFETY: `organization_feature_overrides` has
				// `check (mode <> 'disabled')`, so the database cannot hold that
				// value; the generated enum still carries it, and this is the one
				// place the narrowing happens rather than at every call site.
				mode: o.mode as OverrideMode,
				note: o.note
			}))
			.sort((a, b) => a.featureId.localeCompare(b.featureId)),
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
): Promise<{ id: string; name: string; tierId: string; industryId: string } | null> {
	const row = unwrap(
		await supabase
			.from('organizations')
			.select('id, name, tier_id, industry_id')
			.eq('id', orgId)
			.maybeSingle()
	);
	return row && { id: row.id, name: row.name, tierId: row.tier_id, industryId: row.industry_id };
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

/**
 * Rename one organization — the one platform write that does NOT need the
 * service role, and so does not take it.
 *
 * `organizations.name` is the single column `authenticated` keeps
 * (`grant update (name)` in the organizations migration) and the update
 * policy accepts an owner or admin; `private.org_role()` answers 'owner' for
 * an operator on every organization, so the caller's own client can do this
 * and RLS stays a real boundary. Reaching for the admin client here would
 * buy nothing and quietly widen the area's blast radius.
 *
 * Selects the row back so an organization that vanished between the page
 * load and the post is an error rather than a silent success.
 */
export async function renameOrganization(
	supabase: SupabaseClient<Database>,
	orgId: string,
	name: string
): Promise<void> {
	const row = unwrap(
		await supabase.from('organizations').update({ name }).eq('id', orgId).select('id').maybeSingle()
	);
	if (!row) throw new Error('That organization no longer exists.');
}

/**
 * Move one organization to another vertical.
 *
 * Takes the service-role client for the reason `setOrganizationTier()` does:
 * `industry_id` was deliberately left out of the column grants when the
 * roles migration added it ("exactly like tier_id, set by onboarding /
 * service-role code only, never from the browser").
 *
 * This is the widest-reaching write in the area, and the caller is expected
 * to have said so on screen. The industry decides which features exist at
 * all (`industry_features`), what they are called (`industry_features.name`
 * / `noun`), what order the sidebar puts them in, the vocabulary, and which
 * roles the org may hand out — all re-resolved on the organization's next
 * request. Role ASSIGNMENTS are not rewritten and are not meant to be:
 * `getUserAccess()` and `private.feature_level()` both filter to the org's
 * current industry, so an assignment pointing at the old vertical's roles
 * goes inert rather than granting something nobody chose. Owners and admins
 * keep their implicit access throughout, so an org cannot lock itself out.
 */
export async function setOrganizationIndustry(
	admin: SupabaseClient<Database>,
	orgId: string,
	industryId: string
): Promise<void> {
	const row = unwrap(
		await admin
			.from('organizations')
			.update({ industry_id: industryId })
			.eq('id', orgId)
			.select('id')
			.maybeSingle()
	);
	if (!row) throw new Error('That organization no longer exists.');
}

/**
 * Force one feature to one mode for one organization — the escape hatch the
 * features migration reserves for operators ("pilots, one-off deals, a
 * feature pulled from one customer"), which until now had no path but SQL.
 *
 * An override wins over both the industry and the tier axis, so this is how
 * a customer gets a feature their plan does not include, or loses one it
 * does. It cannot say 'disabled': the table's check constraint keeps that
 * value for the organization's own opt-out at /settings/features, which is
 * the org's decision and not an operator's to make for them.
 *
 * An upsert, because setting a mode twice should be the same as setting it
 * once — the primary key is (org_id, feature_id), so re-picking a mode
 * rewrites the row instead of colliding.
 */
export async function setFeatureOverride(
	admin: SupabaseClient<Database>,
	orgId: string,
	featureId: string,
	mode: OverrideMode,
	note: string | null
): Promise<void> {
	ensure(
		await admin
			.from('organization_feature_overrides')
			.upsert(
				{ org_id: orgId, feature_id: featureId, mode, note },
				{ onConflict: 'org_id,feature_id' }
			)
	);
}

/**
 * Drop an override, returning the feature to whatever the industry and the
 * plan say about it. Selects nothing back to distinguish "there was no such
 * override" from "it is gone now": both leave the organization in the state
 * the operator asked for, and the page re-reads either way.
 */
export async function clearFeatureOverride(
	admin: SupabaseClient<Database>,
	orgId: string,
	featureId: string
): Promise<void> {
	ensure(
		await admin
			.from('organization_feature_overrides')
			.delete()
			.eq('org_id', orgId)
			.eq('feature_id', featureId)
	);
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
