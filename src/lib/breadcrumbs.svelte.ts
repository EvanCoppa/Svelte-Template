import { browser } from '$app/environment';
import { z } from 'zod';
import { isPathUnder } from '$lib/navigation';

/**
 * The breadcrumb trail: how far this tab has gone since it last jumped from
 * the shell, oldest first, the current page last.
 *
 * Deliberately a **depth trail, not a hierarchy**. These pages are siblings
 * under one shell and the same screen is reached from a dozen places, so a
 * tree read off the URL would be fiction: a contact opened from the
 * treatments page did not arrive there through Contacts, and saying so helps
 * nobody find their way back. What the trail records is the way someone
 * actually came — but only the part they walked. Jumping from the sidebar,
 * the ⌘K palette or the user menu lands somewhere new whatever was on screen
 * before, so it starts the trail over at that page; every step taken from
 * inside a page then pushes onto it. Stepping back to a page the trail
 * already holds truncates to it, so the trail only ever grows by going
 * deeper.
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
 * records and renders.
 */

/** How many crumbs a trail keeps, the current page included. */
export const MAX_CRUMBS = 3;

/** A stored trail is untrusted input like any other, so it is parsed, not cast. */
const trailSchema = z.array(z.object({ path: z.string(), title: z.string() }));

export type Crumb = z.infer<typeof trailSchema>[number];

/** sessionStorage keys are namespaced by scope — see `visit()`. */
const STORAGE_PREFIX = 'breadcrumbs:';

/**
 * One step deeper. A page the trail already holds is never repeated: the
 * trail truncates back to it, which is what going back up _is_ — clicking an
 * earlier crumb, or following a link to where you started. The page is
 * re-appended rather than kept, so one named after a record picks up the name
 * it has now. Past `MAX_CRUMBS` the oldest steps fall off the front. Pure, so
 * the trail's rules are testable without a browser.
 */
export function appendCrumb(trail: readonly Crumb[], crumb: Crumb): Crumb[] {
	const seen = trail.findIndex((c) => c.path === crumb.path);
	const kept = seen === -1 ? trail : trail.slice(0, seen);
	return [...kept, crumb].slice(-MAX_CRUMBS);
}

function createBreadcrumbTrail() {
	let crumbs = $state<Crumb[]>([]);
	/**
	 * The trail this tab is currently showing. Starts null so the first visit
	 * after a page load restores from storage — which happens once hydration
	 * is done, so the server's markup and the client's first render agree.
	 */
	let scope = $state<string | null>(null);
	/**
	 * Where a shell surface has just declared it is jumping, awaiting the
	 * navigation that gets there. Not `$state`: nothing renders it, and it is
	 * written and read within one navigation.
	 */
	let jumpingTo: string | null = null;

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
		 * Declare that the next navigation is a jump from the shell — the
		 * sidebar, the ⌘K palette, the user menu — rather than a step deeper
		 * into the page someone is on. Arriving at `href` restarts the trail
		 * there: reaching a page that way is a depth of one, however deep the
		 * trail had gone. Call it immediately before navigating; the page that
		 * arrives has to sit at `href` or inside it — a door like `/settings`
		 * redirecting into its first section is still this jump, while a jump
		 * that ends up somewhere else entirely is recorded as an ordinary step
		 * rather than the wrong page's root.
		 */
		startAt(href: string): void {
			jumpingTo = href;
		},

		/**
		 * Record a completed navigation. `scope` is who is browsing and where —
		 * a trail belongs to one user in one organization, so switching either
		 * picks up that scope's own trail rather than linking pages the new
		 * session may not even be allowed to open.
		 *
		 * `rewound` marks a browser back, which can only shorten the trail:
		 * back to the crumb it lands on, or — landing further back than the
		 * trail goes — to that page alone, since rewinding out of a walk is not
		 * a step in it. Going forward again is an ordinary step.
		 */
		visit(nextScope: string, crumb: Crumb, rewound = false): void {
			if (nextScope !== scope) {
				scope = nextScope;
				crumbs = restore(nextScope);
			}
			// A declared jump is spent by the next navigation recorded, whether
			// or not that is the one declared, so a jump that never arrived can
			// never be mistaken for a later step.
			const jumped = jumpingTo !== null && isPathUnder(jumpingTo, crumb.path);
			jumpingTo = null;
			const known = crumbs.some((c) => c.path === crumb.path);
			crumbs = jumped || (rewound && !known) ? [crumb] : appendCrumb(crumbs, crumb);
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
