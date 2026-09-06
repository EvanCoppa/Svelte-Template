import { browser } from '$app/environment';
import { z } from 'zod';

/**
 * The breadcrumb trail: the last few pages this tab was on, oldest first,
 * the current page last.
 *
 * Deliberately a **history trail, not a hierarchy**. These pages are
 * siblings under one shell and the same screen is reached from a dozen
 * places — the sidebar, the ⌘K palette, a row in a table — so a tree would
 * be fiction dressed up as navigation. What someone actually wants is the
 * way back to where they came from, which is what this records.
 *
 * It lives in `sessionStorage`: this tab's own trail, a couple of hundred
 * bytes, one write per navigation, never sent anywhere. A cookie would ride
 * on every request for something only the browser reads; `localStorage`
 * would let two tabs overwrite each other's trail. Nothing is fetched to
 * build it either — titles arrive already resolved from the page registry
 * (`titleFor()` in `$lib/features/pages`), so a page named after a record
 * keeps the name it showed while it was open.
 *
 * The whole of the trail's behaviour is here; `breadcrumbs.svelte` only
 * renders it.
 */

/** How many crumbs a trail keeps, the current page included. */
export const MAX_CRUMBS = 3;

/** A stored trail is untrusted input like any other, so it is parsed, not cast. */
const trailSchema = z.array(z.object({ path: z.string(), title: z.string() }));

export type Crumb = z.infer<typeof trailSchema>[number];

/** sessionStorage keys are namespaced by scope — see `visit()`. */
const STORAGE_PREFIX = 'breadcrumbs:';

/**
 * Append a visit. A page already in the trail moves to the end instead of
 * appearing twice (people go back and forth), and the oldest crumbs fall off
 * the front. Pure, so the trail's rules are testable without a browser.
 */
export function appendCrumb(trail: readonly Crumb[], crumb: Crumb): Crumb[] {
	return [...trail.filter((c) => c.path !== crumb.path), crumb].slice(-MAX_CRUMBS);
}

function createBreadcrumbTrail() {
	let crumbs = $state<Crumb[]>([]);
	/**
	 * The trail this tab is currently showing. Starts null so the first visit
	 * after a page load restores from storage — which happens once hydration
	 * is done, so the server's markup and the client's first render agree.
	 */
	let scope = $state<string | null>(null);

	return {
		/**
		 * The trail for a scope, oldest first, the current page last. Asking
		 * with a scope the trail was not built in gets nothing back rather than
		 * the previous one's pages — switching organizations in place empties
		 * the header until the next navigation refills it.
		 */
		crumbsIn(wanted: string): readonly Crumb[] {
			return wanted === scope ? crumbs : [];
		},

		/**
		 * Record a completed navigation. `scope` is who is browsing and where —
		 * a trail belongs to one user in one organization, so switching either
		 * picks up that scope's own trail rather than linking pages the new
		 * session may not even be allowed to open.
		 */
		visit(nextScope: string, crumb: Crumb): void {
			if (nextScope !== scope) {
				scope = nextScope;
				crumbs = restore(nextScope);
			}
			crumbs = appendCrumb(crumbs, crumb);
			persist(nextScope, crumbs);
		}
	};
}

/** Storage is absent on the server and can throw in private modes; either way, no trail. */
function restore(scope: string): Crumb[] {
	if (!browser) return [];
	try {
		const raw = sessionStorage.getItem(STORAGE_PREFIX + scope);
		const parsed = trailSchema.safeParse(raw ? JSON.parse(raw) : []);
		return parsed.success ? parsed.data.slice(-MAX_CRUMBS) : [];
	} catch {
		return [];
	}
}

function persist(scope: string, trail: readonly Crumb[]): void {
	if (!browser) return;
	try {
		sessionStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(trail));
	} catch {
		// Storage disabled or full — the trail is a convenience, not state to defend.
	}
}

export const breadcrumbs = createBreadcrumbTrail();
