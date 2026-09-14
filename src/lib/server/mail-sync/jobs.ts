import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Enums, Json, Tables } from '$lib/database.types';
import { ensure, unwrap } from '$lib/server/crm/unwrap';

/**
 * The queue: `mailbox_sync_jobs`, service role only.
 *
 * A job is one unit of Gmail work for one mailbox — a page of backfill, an
 * incremental sync from the stored cursor, a watch renewal — claimed by
 * whichever worker invocation runs next (`claim_mailbox_sync_jobs()`, which
 * skips rows another invocation holds) and either completed, requeued with
 * the next page, or failed with a backoff. The migration's partial unique
 * index folds a burst of pushes into one pending incremental job, so
 * `enqueueJob()` treats that collision as success.
 */

export type SyncJob = Tables<'mailbox_sync_jobs'>;
export type SyncJobKind = Enums<'mailbox_sync_kind'>;

/** Give up after this many claims; the mailbox's `last_error` says why. */
export const MAX_ATTEMPTS = 8;

const UNIQUE_VIOLATION = '23505';

export async function enqueueJob(
	admin: SupabaseClient<Database>,
	job: {
		orgId: string | null;
		mailboxId: string | null;
		kind: SyncJobKind;
		payload?: Json;
		/** Run no sooner than this; defaults to now. */
		nextRunAt?: Date;
	}
): Promise<void> {
	const { error } = await admin.from('mailbox_sync_jobs').insert({
		org_id: job.orgId,
		mailbox_id: job.mailboxId,
		kind: job.kind,
		payload: job.payload ?? {},
		next_run_at: (job.nextRunAt ?? new Date()).toISOString()
	});
	// One of this kind is already pending for the mailbox: that one will run.
	if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message, { cause: error });
}

export async function claimJobs(
	admin: SupabaseClient<Database>,
	worker: string,
	batch: number
): Promise<SyncJob[]> {
	return unwrap(await admin.rpc('claim_mailbox_sync_jobs', { worker, batch }));
}

export async function completeJob(admin: SupabaseClient<Database>, id: string): Promise<void> {
	ensure(
		await admin
			.from('mailbox_sync_jobs')
			.update({ status: 'done', last_error: null, claimed_at: null, claimed_by: null })
			.eq('id', id)
	);
}

/** The job has more to do (the next page): put it back at the front of the queue. */
export async function requeueJob(
	admin: SupabaseClient<Database>,
	id: string,
	payload: Json
): Promise<void> {
	ensure(
		await admin
			.from('mailbox_sync_jobs')
			.update({
				status: 'queued',
				payload,
				attempts: 0,
				next_run_at: new Date().toISOString(),
				claimed_at: null,
				claimed_by: null
			})
			.eq('id', id)
	);
}

/**
 * Something went wrong. Back off — a minute, two, four … an hour — until
 * the attempts run out, then leave the row `failed` for an operator to read.
 * `retryAfterMs` (Gmail's own Retry-After) overrides the backoff.
 */
export async function failJob(
	admin: SupabaseClient<Database>,
	job: Pick<SyncJob, 'id' | 'attempts'>,
	message: string,
	options: { retryAfterMs?: number | null; now?: Date } = {}
): Promise<void> {
	const now = options.now ?? new Date();
	const exhausted = job.attempts >= MAX_ATTEMPTS;
	const delayMs = options.retryAfterMs ?? backoffMs(job.attempts);
	ensure(
		await admin
			.from('mailbox_sync_jobs')
			.update({
				status: exhausted ? 'failed' : 'queued',
				last_error: message.slice(0, 2000),
				next_run_at: new Date(now.getTime() + delayMs).toISOString(),
				claimed_at: null,
				claimed_by: null
			})
			.eq('id', job.id)
	);
}

/** Exponential from one minute, capped at an hour. */
export function backoffMs(attempts: number): number {
	const minutes = Math.min(2 ** Math.max(attempts - 1, 0), 60);
	return minutes * 60 * 1000;
}

const payloadObject = z.record(z.string(), z.unknown());
const payloadValue = z.string().min(1);

/** The string a job's payload carries under `key`, if any. */
export function payloadString(payload: Json, key: string): string | null {
	const object = payloadObject.safeParse(payload);
	if (!object.success) return null;
	const value = payloadValue.safeParse(object.data[key]);
	return value.success ? value.data : null;
}
