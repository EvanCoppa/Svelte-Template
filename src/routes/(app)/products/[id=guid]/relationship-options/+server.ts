import { json } from '@sveltejs/kit';
import { relationshipOptions } from '$lib/server/record-page';
import type { RequestHandler } from './$types';

/**
 * The record picker behind the Relationships card's "Add relationship" form.
 * The card fetches this relative to the page it is on, so this page has its
 * own endpoint over the one shared body.
 */
export const GET: RequestHandler = async ({ locals, url }) =>
	json(await relationshipOptions(locals, 'product', url));
