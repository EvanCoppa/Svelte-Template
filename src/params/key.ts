import { isCatalogKey } from '$lib/admin/keys';

/**
 * A reference-catalog key, as the `[id=key]` segment of the platform area's
 * detail pages: a tier (`free`, `pro`), an industry (`crm`,
 * `medical-supplies`) or a feature (`deals`, `best-practices`). These ids are
 * text primary keys chosen by the migration — or the operator — that creates
 * the row, not uuids, so `[id=guid]` cannot carry them.
 *
 * Which keys EXIST is data the load resolves against the table, never a
 * matcher's business — a matcher runs in the browser too and must stay a
 * pure, data-free test — so this only keeps `/admin/tiers/../x` from reaching
 * a load, exactly as the `[view=view]` matcher does for a view slug. An
 * unknown key is the load's 404.
 *
 * The shape itself lives in `$lib/admin/keys` because the create forms mint
 * keys against the same rule; a key a form accepted but this rejected would
 * be a row with no page.
 */
export function match(param: string): boolean {
	return isCatalogKey(param);
}
