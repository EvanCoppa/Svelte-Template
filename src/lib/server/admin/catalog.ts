import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { unwrap } from '$lib/server/crm/unwrap';
import { loadFeatureRegistry } from '$lib/server/features';

/**
 * The platform's reference catalogs, as the admin directories list them:
 * the plans, the verticals and the feature registry that the two of them
 * index into.
 *
 * All three are reference data — rows written by migration, readable by
 * every authenticated user — so these are plain reads through the
 * request-scoped client. They are listed here, never edited: changing what
 * a plan unlocks or what a vertical includes is a migration, and an editor
 * for them is deferred work (docs/platform-administration.md).
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
		route: row.route,
		category: row.category,
		icon: row.icon,
		sortOrder: row.sort_order,
		plans: row.tier_features.length,
		industries: row.industry_features.length
	}));
}
