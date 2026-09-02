import { redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import { QUERY } from '$lib/queries';
import { navFor } from '$lib/server/route-access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	// The hook's authGuard already protects every non-public route and
	// resolves the org context; this re-check is defense in depth so the
	// (app) group stays private even if someone edits PUBLIC_PATHS carelessly
	// later.
	if (!locals.session || !locals.user || !locals.org) {
		throw redirect(303, '/login');
	}

	// Both keys re-run this load: the org switcher invalidates QUERY.org, the
	// feature settings page changes what QUERY.features resolves to. The hook
	// runs again on that data request, so `locals.org` is fresh here.
	depends(QUERY.org);
	depends(QUERY.features);

	const { organizations, activeOrg } = locals.org;

	return {
		organizations,
		activeOrg,
		// Filtered once, here, from the whole org context — so grants never
		// reach the browser and no component re-checks a mode or a grant. An
		// entry is either linkable, or locked with an upgrade prompt, or absent.
		nav: navFor(locals.org),
		// The sidebar trigger writes its state to a cookie; reading it here means
		// a collapsed sidebar stays collapsed across reloads with no flash.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
