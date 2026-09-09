import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * The presenter group: signed-in screens that fill the viewport with no
 * sidebar, header or breadcrumbs — a slideshow is the whole screen. The
 * hook already guards and feature-gates every route here exactly as it
 * does the (app) group (gating keys on the pathname, not the group); this
 * re-check is the same defense in depth the (app) layout keeps.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.session || !locals.user || !locals.org) throw redirect(303, '/login');
	return {};
};
