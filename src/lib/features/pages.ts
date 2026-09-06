import type { FeatureMap, PageMeta } from './types';

/**
 * Page titles — the registry's other half.
 *
 * `resolve.ts` decides what mode each feature is in and `gate.ts` matches a
 * pathname to the feature that owns it. This file matches a pathname to the
 * PAGE at it, so the `(app)` layout can render a `<title>` that comes from
 * the `pages` table instead of being hardcoded in every page file.
 *
 * Client-safe like the rest of the folder: the layout load ships the pages
 * this session may see, and the shell re-resolves the title on every
 * navigation without another round trip.
 */

/**
 * The pages this session may see: the shell pages (which belong to no
 * feature) plus the pages of every feature the sidebar would show — enabled
 * or locked, and readable. Same predicate as `buildNav()`, so a title never
 * names a page the nav hides.
 */
export function visiblePages(
	pages: readonly PageMeta[],
	features: FeatureMap,
	canRead: (featureId: string) => boolean
): PageMeta[] {
	return pages.filter((page) => {
		if (!page.feature_id) return true;
		const resolved = features[page.feature_id];
		if (!resolved) return false;
		return (
			(resolved.mode === 'enabled' || resolved.mode === 'locked_visible') &&
			canRead(page.feature_id)
		);
	});
}

/**
 * The page a pathname belongs to: an exact match, else the longest
 * registered path it sits under — so `/clients/42` inherits the Clients
 * title until that route registers a page of its own. '/' is matched
 * exactly, never as a prefix; the same rule as `matchFeature()`.
 */
export function matchPage(pathname: string, pages: readonly PageMeta[]): PageMeta | null {
	const ordered = [...pages].sort((a, b) => b.path.length - a.path.length);
	for (const page of ordered) {
		const path = page.path;
		if (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)) {
			return page;
		}
	}
	return null;
}
