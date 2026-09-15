import { json } from '@sveltejs/kit';
import { recordKindForSegment } from '$lib/crm/records';
import { relationshipOptions } from '$lib/server/record-page';
import type { RequestHandler } from './$types';

/**
 * The record picker behind the Relationships card's "Add relationship" form.
 * The card fetches this relative to the page it is on, so every route with a
 * record page has one of these over the one shared body.
 */
export const GET: RequestHandler = async ({ locals, params, url }) =>
	json(await relationshipOptions(locals, recordKindForSegment(params.kind), url));
