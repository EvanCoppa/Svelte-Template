import type { Enums, Tables } from '$lib/database.types';

/**
 * The feature registry as the app consumes it. A feature is one navigable
 * capability — a page or a coherent cluster of pages — registered as a row
 * in `features` (see the features migration). Everything in this folder is
 * client-safe on purpose: the same resolver and matcher decide "may I serve
 * this" in hooks.server.ts and "may I link to this" in the nav.
 */

/**
 * The feature keys the app knows at build time, in lockstep with the
 * `features` table: the migration adding a feature's row also adds its id
 * here. Checks take this union so a typo'd key is a `check` error — with a
 * bare string it would silently pass for owners/admins (the bypass) while
 * denying every member.
 */
export const FEATURE_IDS = [
	'calendar',
	'companies',
	'contacts',
	'products',
	'deals',
	'proposals',
	'billables',
	'quick-plans',
	'invoices',
	'ledger',
	'assets',
	// The rental portfolio (the properties_and_leases migration). Real-estate
	// only — every other industry resolves both `hidden` for want of a row.
	'properties',
	'leases',
	'notes',
	'tasks',
	'tickets',
	'staff',
	'components',
	'best-practices',
	'assistant',
	// The relationship graph, read whole (the relationship_graph migration).
	'graph',
	// Views — each a features row at /views/<id> (the views migration).
	'suppliers',
	'partner-contacts',
	'patient-map',
	'merchant-map',
	'prospects',
	'referral-partners'
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/**
 * One mode per feature per session:
 *
 *   enabled        — normal
 *   locked_visible — the org's industry includes it, its plan doesn't; shown,
 *                    teasing an upgrade (the tier axis)
 *   disabled       — available, but the org switched it off itself
 *   hidden         — not part of this industry; it does not exist as far as
 *                    the org is concerned (the industry axis)
 */
export type FeatureMode = Enums<'feature_mode'>;

export type Feature = Tables<'features'>;

/**
 * A registry row with its industry and tier maps embedded, as loaded. An
 * industry row may carry the industry's own words for the feature (`name`,
 * `noun` — the feature_names_by_industry migration) and its own position in
 * the sidebar section (`sort_order` — the industry_feature_order migration);
 * null inherits the feature's, column by column.
 */
export type FeatureRegistryRow = Feature & {
	industry_features: Pick<
		Tables<'industry_features'>,
		'industry_id' | 'name' | 'noun' | 'sort_order'
	>[];
	tier_features: { tier_id: string }[];
};

/** A per-org override row, as the resolver reads it. */
export type FeatureOverride = Pick<Tables<'organization_feature_overrides'>, 'feature_id' | 'mode'>;

export type ResolvedFeature = { feature: Feature; mode: FeatureMode };

/** Every registered feature, keyed by id, with its mode for the session. */
export type FeatureMap = Record<string, ResolvedFeature>;

/**
 * One registered page as loaded: a screen under a feature's route, or one of
 * the shell pages that belong to no feature (`feature_id` null — the
 * dashboard and settings). A null `title` means "the owning feature's name,
 * as the org's industry says it" (the feature_names_by_industry migration);
 * `created_at` stays on the server.
 */
export type PageRow = Pick<Tables<'pages'>, 'id' | 'feature_id' | 'path' | 'title'>;

/** A page as the browser sees it — the title already filled in by `visiblePages()`. */
export type PageMeta = Omit<PageRow, 'title'> & { title: string };
