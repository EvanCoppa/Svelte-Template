import { redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	// The hook's authGuard already protects every non-public route; this
	// re-check is defense in depth so the (app) group stays private even if
	// someone edits PUBLIC_PATHS carelessly later.
	if (!locals.session || !locals.user) {
		throw redirect(303, '/login');
	}

	return {
		// The sidebar trigger writes its state to a cookie; reading it here means
		// a collapsed sidebar stays collapsed across reloads with no flash.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
