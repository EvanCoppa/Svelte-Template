import { redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import { featureGateFor } from '$lib/features/gate';
import { visiblePages } from '$lib/features/pages';
import { upgradePlans } from '$lib/features/plans';
import { visibleTerms } from '$lib/features/terms';
import { buildNav } from '$lib/navigation';
import { QUERY } from '$lib/queries';
import { DOCK_NOTE_LIMIT, listNotes } from '$lib/server/crm/notes';
import { listTiersWithFeatures, loadPageRegistry } from '$lib/server/features';
import { noteAccess } from '$lib/server/notes';
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
	// The dock hangs off the shell, not off a page, so its notes are loaded
	// once here and refreshed by the one key every note surface invalidates.
	depends(QUERY.notes);

	const { organizations, activeOrg, features, access } = locals.org;
	const canRead = (featureId: string) => hasGrant(access, featureId);

	// The dock draws on every screen, so it asks the gate the same question
	// `hooks.server.ts` would ask of /notes — a locked, disabled, hidden or
	// unreadable feature ships nothing rather than an empty rail.
	const notesShown = featureGateFor('/notes', features, canRead) === null;

	// Reference data, read once per session (this load reruns only on the
	// keys above), so the upgrade prompt opens anywhere without a round trip
	// and the shell can title a page it navigates to without one either. The
	// notes are not reference data: QUERY.notes above re-runs all of this
	// whenever one is written, which is the price of one query key.
	const [tiers, pages, openNotes] = await Promise.all([
		listTiersWithFeatures(locals.supabase),
		loadPageRegistry(locals.supabase),
		notesShown
			? listNotes(locals.supabase, activeOrg.id, { archived: false, limit: DOCK_NOTE_LIMIT })
			: []
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
		// What each visible feature is called, as the org's industry words it —
		// the "Add …" button, the row count and the record page read these.
		// Filtered exactly like the nav, so grants never reach the browser.
		terms: visibleTerms(features, canRead),
		// The rail the note dock draws down the edge of every screen, and what
		// this session may do to it. Null keeps the dock off the page entirely.
		noteDock: notesShown ? { open: openNotes, ...noteAccess(locals.org, locals.user.id) } : null,
		// What each plan above the org's own would unlock — the upgrade prompt's
		// pitch, keyed like the nav on tier and mode (grants play no part).
		plans: upgradePlans(tiers, features, activeOrg.tierId),
		// The sidebar trigger writes its state to a cookie; reading it here means
		// a collapsed sidebar stays collapsed across reloads with no flash.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'
	};
};
