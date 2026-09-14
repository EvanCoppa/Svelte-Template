import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { ensure, unwrap } from '$lib/server/crm/unwrap';
import { loadFeatureRegistry } from '$lib/server/features';

/**
 * The platform's reference catalogs, as the admin directories list them:
 * the plans, the verticals and the feature registry that the two of them
 * index into.
 *
 * All three are reference data: readable by every authenticated user, and
 * with no write policy at all. So every READ here is a plain read through
 * the request-scoped client, and every WRITE takes the service-role client
 * the action creates for it — the same division `organizations.ts` makes,
 * for the same reason. A parameter named `admin` is a service-role client
 * and its function is reachable only from an action that has already proved
 * `requireSystemAdmin()`.
 *
 * Editing a catalog changes what every organization on the platform can
 * reach, but it changes nothing in this browser: the resolved answer a
 * tenant sees is rebuilt on that organization's next request. Nothing here
 * invalidates a tenant query key, and nothing here should.
 *
 * A migration is still how a catalog is SHIPPED — the seeded plans,
 * verticals and features are rows in a migration file so production gets
 * them too. These editors are how it is operated afterwards; the two are
 * not in tension as long as an edit made here is written back into a
 * migration before it is relied on by a fresh database.
 *
 * Counts come back as embedded aggregates in the same round trip rather
 * than as a second query the app then tallies.
 */

/** How much of each thing the platform holds — the overview's four cards. */
export type PlatformCounts = {
	organizations: number;
	tiers: number;
	industries: number;
	features: number;
};

/**
 * The overview's headline numbers, four head requests in parallel. A count
 * is not `unwrap()`'s shape (it carries no rows), so the reader below is the
 * one place that unpacks it — everything else in the platform area reads
 * rows the ordinary way.
 */
export async function countPlatform(supabase: SupabaseClient<Database>): Promise<PlatformCounts> {
	const [organizations, tiers, industries, features] = await Promise.all([
		countRows(supabase, 'organizations'),
		countRows(supabase, 'tiers'),
		countRows(supabase, 'industries'),
		countRows(supabase, 'features')
	]);
	return { organizations, tiers, industries, features };
}

async function countRows(
	supabase: SupabaseClient<Database>,
	table: 'organizations' | 'tiers' | 'industries' | 'features'
): Promise<number> {
	const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
	if (error) throw new Error(error.message, { cause: error });
	return count ?? 0;
}

/** One row of the tiers directory. */
export type AdminTier = {
	id: string;
	name: string;
	/** Organizations currently on this plan. */
	organizations: number;
	/** Features this plan unlocks. */
	features: number;
};

/** One row of the industries directory. */
export type AdminIndustry = {
	id: string;
	name: string;
	organizations: number;
	/** Features this vertical includes at all — the industry axis. */
	features: number;
};

/** One row of the feature registry directory. */
export type AdminFeature = {
	id: string;
	name: string;
	/** The lower-case singular of one row of it — 'quote', 'patient'. */
	noun: string | null;
	route: string;
	category: string | null;
	/** A lucide slug; `iconFor()` turns it into a component. */
	icon: string | null;
	sortOrder: number;
	/** Plans that unlock it. */
	plans: number;
	/** Verticals that include it. */
	industries: number;
};

/**
 * Every plan, cheapest first. Plans nest, so the one unlocking the fewest
 * features is the smallest step up — the same ordering the upgrade prompt
 * pitches in (`upgradePlans()` in `$lib/features/plans`), rather than a
 * price column the schema does not have.
 */
export async function listTierDirectory(supabase: SupabaseClient<Database>): Promise<AdminTier[]> {
	const rows = unwrap(
		await supabase.from('tiers').select('id, name, organizations(count), tier_features(count)')
	);
	return rows
		.map((row) => ({
			id: row.id,
			name: row.name,
			organizations: row.organizations[0]?.count ?? 0,
			features: row.tier_features[0]?.count ?? 0
		}))
		.sort((a, b) => a.features - b.features || a.name.localeCompare(b.name));
}

/** Every vertical, by name, with how much of the platform sits in it. */
export async function listIndustryDirectory(
	supabase: SupabaseClient<Database>
): Promise<AdminIndustry[]> {
	const rows = unwrap(
		await supabase
			.from('industries')
			.select('id, name, organizations(count), industry_features(count)')
			.order('name')
	);
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		organizations: row.organizations[0]?.count ?? 0,
		features: row.industry_features[0]?.count ?? 0
	}));
}

/**
 * The feature registry in nav order — what the product is made of, read
 * through the one query that loads it (`loadFeatureRegistry()`), so the
 * directory and the resolver can never be looking at different registries.
 * The two maps it embeds become the counts an operator wants: how many
 * plans unlock the feature, and how many verticals include it.
 */
export async function listFeatureDirectory(
	supabase: SupabaseClient<Database>
): Promise<AdminFeature[]> {
	const rows = await loadFeatureRegistry(supabase);
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		noun: row.noun,
		route: row.route,
		category: row.category,
		icon: row.icon,
		sortOrder: row.sort_order,
		plans: row.tier_features.length,
		industries: row.industry_features.length
	}));
}

// ---------------------------------------------------------------------------
// One plan
// ---------------------------------------------------------------------------

/** One plan, as its page edits it. */
export type AdminTierDetail = {
	id: string;
	name: string;
	/** Organizations currently on this plan — what a change here lands on. */
	organizations: number;
	/** The features it unlocks, by id. */
	featureIds: string[];
};

/** One plan and what it unlocks, or null when no such plan exists. */
export async function getTier(
	supabase: SupabaseClient<Database>,
	tierId: string
): Promise<AdminTierDetail | null> {
	const row = unwrap(
		await supabase
			.from('tiers')
			.select('id, name, organizations(count), tier_features(feature_id)')
			.eq('id', tierId)
			.maybeSingle()
	);
	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		organizations: row.organizations[0]?.count ?? 0,
		featureIds: row.tier_features.map((f) => f.feature_id)
	};
}

/**
 * Add a plan. The id is the key every later row points at (`tier_features`,
 * `organizations.tier_id`), so it is chosen once here and never edited
 * afterwards — renaming a primary key would orphan the rows referencing it,
 * and the display name is the thing a customer actually reads.
 *
 * A new plan unlocks nothing until features are picked for it, which is the
 * honest starting point: an empty plan shows every feature as an upgrade
 * prompt rather than silently granting the platform.
 */
export async function createTier(
	admin: SupabaseClient<Database>,
	tier: { id: string; name: string }
): Promise<void> {
	ensure(await admin.from('tiers').insert({ id: tier.id, name: tier.name }));
}

/** Rename a plan. The id, which everything points at, stays as it was. */
export async function renameTier(
	admin: SupabaseClient<Database>,
	tierId: string,
	name: string
): Promise<void> {
	const row = unwrap(
		await admin.from('tiers').update({ name }).eq('id', tierId).select('id').maybeSingle()
	);
	if (!row) throw new Error('That plan no longer exists.');
}

/**
 * Set exactly which features this plan unlocks.
 *
 * Written as a DIFF rather than "delete every row, insert the new set", and
 * that is not an optimization: `tier_features` rows carry a `created_at`
 * that says when a plan gained a feature, and a blanket rewrite would reset
 * it for every feature the operator did not touch. `industry_features` makes
 * the same choice for much higher stakes — see `setIndustryFeatures()`.
 */
export async function setTierFeatures(
	admin: SupabaseClient<Database>,
	tierId: string,
	featureIds: string[]
): Promise<void> {
	const current = unwrap(
		await admin.from('tier_features').select('feature_id').eq('tier_id', tierId)
	).map((row) => row.feature_id);

	const { add, remove } = membershipDiff(current, featureIds);

	if (remove.length > 0) {
		ensure(
			await admin.from('tier_features').delete().eq('tier_id', tierId).in('feature_id', remove)
		);
	}
	if (add.length > 0) {
		ensure(
			await admin
				.from('tier_features')
				.insert(add.map((featureId) => ({ tier_id: tierId, feature_id: featureId })))
		);
	}
}

// ---------------------------------------------------------------------------
// One vertical
// ---------------------------------------------------------------------------

/**
 * One feature as one industry carries it. `name`, `noun` and `sortOrder` are
 * the industry's own say over the feature's row, and null means "inherit the
 * default" column by column — the rule `resolveFeatures()` applies and the
 * reason membership is edited as a diff below.
 */
export type AdminIndustryFeature = {
	featureId: string;
	name: string | null;
	noun: string | null;
	sortOrder: number | null;
};

/** One vertical, as its page edits it. */
export type AdminIndustryDetail = {
	id: string;
	name: string;
	organizations: number;
	features: AdminIndustryFeature[];
};

/** One vertical and everything it says about its features, or null. */
export async function getIndustry(
	supabase: SupabaseClient<Database>,
	industryId: string
): Promise<AdminIndustryDetail | null> {
	const row = unwrap(
		await supabase
			.from('industries')
			.select(
				'id, name, organizations(count), industry_features(feature_id, name, noun, sort_order)'
			)
			.eq('id', industryId)
			.maybeSingle()
	);
	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		organizations: row.organizations[0]?.count ?? 0,
		features: row.industry_features
			.map((f) => ({
				featureId: f.feature_id,
				name: f.name,
				noun: f.noun,
				sortOrder: f.sort_order
			}))
			.sort((a, b) => a.featureId.localeCompare(b.featureId))
	};
}

/**
 * Add a vertical.
 *
 * Two things about a brand new one are worth knowing before the first
 * organization is put in it, and the page says both: it includes no features
 * until they are picked (absent from `industry_features` means hidden, so
 * every page 404s), and it has no roles, because roles are industry-scoped
 * reference data that ship by migration. Owners and admins still hold
 * everything implicitly, so an organization moved here is not locked out —
 * but nobody else can be granted anything until the vertical has a role
 * ladder of its own.
 */
export async function createIndustry(
	admin: SupabaseClient<Database>,
	industry: { id: string; name: string }
): Promise<void> {
	ensure(await admin.from('industries').insert({ id: industry.id, name: industry.name }));
}

/** Rename a vertical. Its id, which orgs and roles point at, stays. */
export async function renameIndustry(
	admin: SupabaseClient<Database>,
	industryId: string,
	name: string
): Promise<void> {
	const row = unwrap(
		await admin.from('industries').update({ name }).eq('id', industryId).select('id').maybeSingle()
	);
	if (!row) throw new Error('That industry no longer exists.');
}

/**
 * Set exactly which features this vertical includes.
 *
 * A DIFF, and here it matters: an `industry_features` row is not a bare join
 * row. It also carries this vertical's own name and noun for the feature
 * ("quote" to a roofer, "treatment plan" to a dentist) and its own position
 * in the sidebar. Deleting every row and re-inserting the set would silently
 * throw all of that away for every feature that was only passing through, so
 * only the genuinely added and genuinely removed rows are touched. Removing
 * one and adding it back IS a reset of its naming, which is the honest
 * reading of taking a feature out of a vertical.
 */
export async function setIndustryFeatures(
	admin: SupabaseClient<Database>,
	industryId: string,
	featureIds: string[]
): Promise<void> {
	const current = unwrap(
		await admin.from('industry_features').select('feature_id').eq('industry_id', industryId)
	).map((row) => row.feature_id);

	const { add, remove } = membershipDiff(current, featureIds);

	if (remove.length > 0) {
		ensure(
			await admin
				.from('industry_features')
				.delete()
				.eq('industry_id', industryId)
				.in('feature_id', remove)
		);
	}
	if (add.length > 0) {
		ensure(
			await admin
				.from('industry_features')
				.insert(add.map((featureId) => ({ industry_id: industryId, feature_id: featureId })))
		);
	}
}

/**
 * What this vertical calls one feature, and where it puts it.
 *
 * Null is meaningful and is not the same as blank: it means "inherit the
 * feature's default", column by column, which is exactly how the resolver
 * reads the row. So an empty input clears the override rather than storing
 * an empty string, and the feature goes back to its own name, noun and
 * sort order.
 *
 * Updates an existing row only — a feature this vertical does not include
 * has nothing to name, and the page offers this per included feature.
 */
export async function setIndustryFeatureNaming(
	admin: SupabaseClient<Database>,
	industryId: string,
	featureId: string,
	naming: { name: string | null; noun: string | null; sortOrder: number | null }
): Promise<void> {
	const row = unwrap(
		await admin
			.from('industry_features')
			.update({ name: naming.name, noun: naming.noun, sort_order: naming.sortOrder })
			.eq('industry_id', industryId)
			.eq('feature_id', featureId)
			.select('feature_id')
			.maybeSingle()
	);
	if (!row) throw new Error('This vertical does not include that feature.');
}

// ---------------------------------------------------------------------------
// One feature
// ---------------------------------------------------------------------------

/** One registry row, as its page edits it. */
export type AdminFeatureDetail = {
	id: string;
	name: string;
	noun: string | null;
	description: string | null;
	/** The route prefix it owns. Read-only here: it is a fact about the code. */
	route: string;
	icon: string | null;
	category: string | null;
	sortOrder: number;
	/** The plans that unlock it and the verticals that include it, by id. */
	tierIds: string[];
	industryIds: string[];
};

/** One feature and where it appears, or null when no such feature exists. */
export async function getFeature(
	supabase: SupabaseClient<Database>,
	featureId: string
): Promise<AdminFeatureDetail | null> {
	const row = unwrap(
		await supabase
			.from('features')
			.select(
				'id, name, noun, description, route, icon, category, sort_order, tier_features(tier_id), industry_features(industry_id)'
			)
			.eq('id', featureId)
			.maybeSingle()
	);
	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		noun: row.noun,
		description: row.description,
		route: row.route,
		icon: row.icon,
		category: row.category,
		sortOrder: row.sort_order,
		tierIds: row.tier_features.map((t) => t.tier_id).sort(),
		industryIds: row.industry_features.map((i) => i.industry_id).sort()
	};
}

/**
 * Edit a registry row's metadata — how it reads and where it sits.
 *
 * Deliberately cannot touch `id` or `route`. Both are facts about the CODE:
 * the route prefix is what the feature gate matches a request against and
 * what the nav links to, so a route that names no `+page.svelte` is a
 * feature whose every click 404s, and an id is what the migrations, the
 * grants and `FEATURE_IDS` all point at. Changing either is a migration
 * alongside the route it describes, which is also why this module has no
 * `createFeature()`: a registry row with no page behind it is a broken
 * sidebar entry, not a new capability.
 *
 * `name`, `noun`, `description`, `icon`, `category` and `sort_order` are what
 * remains, and
 * they are safe because every one of them is overridable per industry
 * anyway — this row is the default the vertical falls back to.
 */
export async function updateFeature(
	admin: SupabaseClient<Database>,
	featureId: string,
	patch: {
		name: string;
		noun: string | null;
		description: string | null;
		icon: string | null;
		category: string | null;
		sortOrder: number;
	}
): Promise<void> {
	const row = unwrap(
		await admin
			.from('features')
			.update({
				name: patch.name,
				noun: patch.noun,
				description: patch.description,
				icon: patch.icon,
				category: patch.category,
				sort_order: patch.sortOrder
			})
			.eq('id', featureId)
			.select('id')
			.maybeSingle()
	);
	if (!row) throw new Error('That feature no longer exists.');
}

/**
 * What changed between the set of keys a join table holds and the set that
 * was asked for. Pure, and exported because it is the part of every
 * membership write worth testing on its own: the two callers above lean on
 * it to leave untouched rows — and the columns they carry — alone.
 */
export function membershipDiff(current: string[], next: string[]) {
	const have = new Set(current);
	const want = new Set(next);
	return {
		add: [...want].filter((id) => !have.has(id)),
		remove: [...have].filter((id) => !want.has(id))
	};
}
