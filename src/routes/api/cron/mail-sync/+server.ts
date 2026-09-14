import { error, json } from '@sveltejs/kit';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { mailSyncConfig } from '$lib/server/mail-sync/config';
import { drain, scheduleHousekeeping } from '$lib/server/mail-sync/worker';
import type { RequestHandler } from './$types';

/**
 * The cron tick (vercel.json: every minute). Vercel calls it with
 * `Authorization: Bearer <CRON_SECRET>`; anyone else gets a 401, and with
 * no secret configured so does Vercel — the worker never runs unguarded.
 * Locally, `curl -H "authorization: Bearer $CRON_SECRET" localhost:5173/api/cron/mail-sync`
 * is how the queue is driven by hand.
 *
 * Housekeeping first (watches to renew, mailboxes to poll), then the queue
 * is drained until the function's time is nearly up. Overlapping ticks are
 * safe: claiming skips locked rows.
 */

/** Vercel's ceiling for this function; the drain stops well inside it. */
export const config = { maxDuration: 300 };
const BUDGET_MS = 240_000;

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorized(request.headers.get('authorization'), env.CRON_SECRET)) {
		throw error(401, 'Not authorized.');
	}
	const sync = mailSyncConfig();
	if (!sync) return json({ skipped: 'Email sync is not configured.' });

	const deps = { admin: createSupabaseAdminClient(), config: sync };
	await scheduleHousekeeping(deps);
	const summary = await drain(deps, {
		deadline: Date.now() + BUDGET_MS,
		worker: `cron:${randomUUID()}`
	});
	return json(summary);
};

function isAuthorized(header: string | null, secret: string | undefined): boolean {
	if (!secret || !header) return false;
	const expected = Buffer.from(`Bearer ${secret}`);
	const given = Buffer.from(header);
	return expected.length === given.length && timingSafeEqual(expected, given);
}
