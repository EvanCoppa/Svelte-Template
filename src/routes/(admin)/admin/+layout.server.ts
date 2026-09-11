import { adminTitleFor } from '$lib/admin/nav';
import { requireSystemAdmin } from '$lib/server/admin/guard';
import type { LayoutServerLoad } from './$types';

/**
 * The platform area's authorization boundary and its shell data.
 *
 * A layout load runs before every child page's, so this one check covers
 * every admin PAGE. It does not cover an action — a POST reaches one with no
 * load in front of it — which is why each action calls
 * `requireSystemAdmin()` for itself as well.
 *
 * Nothing tenant-shaped is loaded here on purpose: no organizations, no
 * feature map, no terms, no nav. The hook skipped the org context for
 * `/admin` entirely (see hooks.server.ts), so the active-organization cookie
 * this operator left in the app is still exactly as they left it.
 *
 * `title` names every page in the group from the one hand-kept list
 * (`$lib/admin/nav`), reading `url` so it re-resolves on each navigation. A
 * page whose name depends on a record returns its own `title`, and page data
 * wins over the layout's — the same rule the `(app)` shell follows with the
 * `pages` registry.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = await requireSystemAdmin(locals);

	return {
		/** Who is operating, for the shell's identity line. */
		operator: { id: user.id, email: user.email ?? null },
		title: adminTitleFor(url.pathname)
	};
};
