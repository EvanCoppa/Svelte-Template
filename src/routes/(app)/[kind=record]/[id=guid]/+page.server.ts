import { error } from '@sveltejs/kit';
import { isRecordSegment, recordKindForSegment, type RecordKind } from '$lib/crm/records';
import { loadRecordPage, recordPageActions } from '$lib/server/record-page';
import type { Actions, PageServerLoad } from './$types';
import { billingActions, loadBilling } from './billing.server';

/**
 * The generic record page — the default page for one record of any kind.
 *
 * `/contacts/<id>`, `/products/<id>`, `/tasks/<id>` and the rest all land
 * here: the `[kind=record]` matcher accepts exactly the list routes in
 * `$lib/crm/records`, and `[id=guid]` a Postgres uuid. Sitting under each
 * kind's list route is what gates it — the hook already decides whether this
 * session may open anything under `/contacts`, so the page needs no check of
 * its own, and nothing about it is registered in `pages`: its title is the
 * record's name (the record-title exception in the pages migration), and
 * until then the shell titles it after the list it belongs to.
 *
 * What a record page shows is `$lib/server/record-page.ts`, not this file —
 * the header, the tabs and the rail are the same for every kind, so they are
 * a module both this route and a kind's own page compose. When a kind earns
 * a page of its own it goes at `src/routes/(app)/<kind>/[id=guid]/`; a static
 * segment outranks `[kind=record]`, so the specific page takes over and this
 * one stays the default for the rest (`/companies/<id>` is the worked
 * example).
 *
 * All this route adds is the one block that belongs to a single kind: an
 * invoice's lines and money, which `billing.server.ts` keeps — drawn whenever
 * the load supplies `billing`, a data-presence check like the thread's.
 */

/** Which kind the matched segment serves — the one thing this route knows that the shell does not. */
function kindOf({ params }: { params: Partial<Record<string, string>> }): RecordKind {
	const segment = params.kind;
	// Unreachable through the matcher, which already answered this question;
	// the check keeps the type honest without a cast.
	if (!segment || !isRecordSegment(segment)) throw error(400, 'Unknown kind of record.');
	return recordKindForSegment(segment);
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const kind = kindOf({ params });
	const [page, billing] = await Promise.all([
		loadRecordPage(locals, kind, params.id, depends),
		// Null for every kind but an invoice; the block's own module decides.
		loadBilling(locals, params)
	]);
	return { ...page, billing };
};

export const actions: Actions = {
	// The invoice block's nine actions — lines, header, lifecycle, money.
	...billingActions,
	// The record's own fields, its addresses, its photos, its conversation and
	// its relationships — the same ones every record page has.
	...recordPageActions(kindOf)
};
