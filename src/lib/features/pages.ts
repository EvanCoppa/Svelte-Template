import { isVisible } from './resolve';
import type { FeatureMap, PageMeta, PageRow } from './types';

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
 *
 * A page with no title of its own is named after its feature, as the org's
 * industry words it — the way a feature's own list page follows an
 * industry's rename with one row (the feature_names_by_industry migration).
 */
export function visiblePages(
	pages: readonly PageRow[],
	features: FeatureMap,
	canRead: (featureId: string) => boolean
): PageMeta[] {
	const shown: PageMeta[] = [];
	for (const page of pages) {
		if (page.feature_id === null) {
			// The check constraint guarantees a title here; a row without one is not a page.
			if (page.title !== null) shown.push({ ...page, title: page.title });
			continue;
		}
		const resolved = features[page.feature_id];
		if (!resolved || !isVisible(resolved, canRead)) continue;
		shown.push({ ...page, title: page.title ?? resolved.feature.name });
	}
	return shown;
}

/**
 * The page a pathname belongs to: an exact match, else the longest
 * registered path it sits under — so `/companies/42` inherits the Companies
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

/**
 * What the page currently rendering is called: the record-specific title its
 * own load returned, else the registry's. The one answer to "what is this
 * page's name" — the `(app)` layout titles the document with it, the
 * breadcrumb trail records it and `PageHeader.Title` heads the page with it,
 * so the three can never disagree.
 */
export function titleFor(data: App.PageData, pathname: string): string | undefined {
	return data.title ?? matchPage(pathname, data.pages ?? [])?.title;
}
