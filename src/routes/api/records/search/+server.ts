import { error, json } from '@sveltejs/kit';
import { RECORD_KINDS, recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { listRecordNames } from '$lib/server/crm/records';
import { loadOrgContext } from '$lib/server/org-context';
import { hasGrant } from '$lib/server/roles';
import type { RequestHandler } from './$types';

/**
 * Records by name, across every kind the caller may open — what the `@` menu
 * in a page's editor picks from.
 *
 * A `+server.ts` rather than a form action, and the first of CLAUDE.md's
 * listed exceptions: a JS-triggered GET read, search-as-you-type. There is no
 * form here and nothing is written.
 *
 * **The gate answers first, kind by kind.** A kind whose feature is off for
 * the org, or that this member has no `read` grant for, is never fetched — so
 * the menu cannot offer a record the reader could not open, and the endpoint
 * cannot be used to enumerate one. RLS is still the boundary underneath; this
 * is the same belt the record page wears when it decides whether a related
 * record is a link or plain text.
 */

/** Below this the menu is not useful and the query is not worth running. */
const MIN_QUERY = 2;
/** What one kind may contribute, so no single list can crowd the menu out. */
const PER_KIND = 8;
/** What the menu shows at once. */
const LIMIT = 20;

export type RecordSearchHit = { kind: RecordKind; id: string; label: string };

export const GET: RequestHandler = async (event) => {
	const query = (event.url.searchParams.get('q') ?? '').trim();
	if (query.length < MIN_QUERY) return json({ results: [] });

	const org = await loadOrgContext(event);
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const kinds = RECORD_KINDS.filter((kind) =>
		passesFeatureGate(recordListHref(kind), org.features, canRead)
	);
	if (kinds.length === 0) return json({ results: [] });

	const needle = query.toLowerCase();
	let found: RecordSearchHit[];
	try {
		// One read per openable kind, which is what the graph page already pays
		// for the same guarantee: a name here is the string that kind's own
		// module produces, so a mention reads exactly as the record's page
		// titles it. If this ever becomes the slow part of typing, the fix is a
		// single Postgres function searching the tables at once — not a second
		// namer here, which would let the menu and the record disagree.
		const perKind = await Promise.all(
			kinds.map(async (kind) =>
				(await listRecordNames(event.locals.supabase, org.activeOrg.id, kind))
					.filter((row) => row.name.toLowerCase().includes(needle))
					.slice(0, PER_KIND)
					.map((row) => ({ kind, id: row.id, label: row.name }))
			)
		);
		found = perKind.flat();
	} catch {
		throw error(500, 'Those records could not be searched.');
	}

	// A name that starts with what was typed is what the typist meant; the
	// rest follow, shortest first, so "Acme" beats "Acme Holdings Group".
	found.sort((a, b) => {
		const aStarts = a.label.toLowerCase().startsWith(needle);
		const bStarts = b.label.toLowerCase().startsWith(needle);
		if (aStarts !== bStarts) return aStarts ? -1 : 1;
		return a.label.length - b.label.length || a.label.localeCompare(b.label);
	});

	return json({ results: found.slice(0, LIMIT) });
};
