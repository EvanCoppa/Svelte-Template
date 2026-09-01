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
	'clients',
	'deals',
	'tasks',
	'tickets',
	'staff',
	'components',
	'best-practices'
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

/** A registry row with its industry and tier maps embedded, as loaded. */
export type FeatureRegistryRow = Feature & {
	industry_features: { industry_id: string }[];
	tier_features: { tier_id: string }[];
};

/** A per-org override row, as the resolver reads it. */
export type FeatureOverride = Pick<Tables<'organization_feature_overrides'>, 'feature_id' | 'mode'>;

export type ResolvedFeature = { feature: Feature; mode: FeatureMode };

/** Every registered feature, keyed by id, with its mode for the session. */
export type FeatureMap = Record<string, ResolvedFeature>;
