import { redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import { visiblePages } from '$lib/features/pages';
import { upgradePlans } from '$lib/features/plans';
import { buildNav } from '$lib/navigation';
import { QUERY } from '$lib/queries';
import { listTiersWithFeatures, loadPageRegistry } from '$lib/server/features';
import { hasGrant } from '$lib/server/roles';
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

	const { organizations, activeOrg, features, access } = locals.org;
	const canRead = (featureId: string) => hasGrant(access, featureId);

	// Reference data, read once per session (this load reruns only on the
	// keys above), so the upgrade prompt opens anywhere without a round trip
	// and the shell can title a page it navigates to without one either.
	const [tiers, pages] = await Promise.all([
		listTiersWithFeatures(locals.supabase),
		loadPageRegistry(locals.supabase)
	]);

	return {
		organizations,
		activeOrg,
		// Filtered server-side so grants never reach the browser: an entry is
		// either linkable, or locked with an upgrade prompt, or absent.
		nav: buildNav(features, canRead),
		// Every page's title, filtered exactly like the nav. The layout matches
		// the current pathname against these — see the pages migration.
		pages: visiblePages(pages, features, canRead),
		// What each plan above the org's own would unlock — the upgrade prompt's
		// pitch, keyed like the nav on tier and mode (grants play no part).
		plans: upgradePlans(tiers, features, activeOrg.tierId),
		// The sidebar trigger writes its state to a cookie; reading it here means
		// a collapsed sidebar stays collapsed across reloads with no flash.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
