import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '$lib/database.types';
import {
	gmailClient,
	type GmailClient,
	type GmailFailure,
	type GmailHistoryRecord
} from '$lib/server/integrations/google/gmail';
import { revokeToken } from '$lib/server/integrations/google/oauth';
import { ensure, unwrap } from '$lib/server/crm/unwrap';
import type { MailSyncConfig } from './config';
import { accessTokenFor, markReauthorize } from './credentials';
import {
	buildMatchIndex,
	forgetMessage,
	heldGmailIds,
	ingestMessage,
	loadExclusions,
	type MailboxRow
} from './ingest';
import {
	claimJobs,
	completeJob,
	enqueueJob,
	failJob,
	payloadString,
	requeueJob,
	type SyncJob
} from './jobs';
import type { MatchIndex } from './match';
import { openSecret } from './tokens';

/**
 * The worker: turns queued jobs into Gmail calls and rows.
 *
 * Runs inside a Vercel function — the cron's every minute, the push
 * endpoint's after a notification, the settings page's "Sync now" for one
 * mailbox — so every job is sized to finish well inside one invocation and
 * `drain()` stops claiming when its deadline nears. Nothing here is a long
 * process: a backfill is a chain of one-page jobs, each requeuing the next.
 *
 *   backfill          messages.list newest-first over BACKFILL_DAYS, a page
 *                     per run, batch-fetched, ingested; the last page stamps
 *                     backfilled_at
 *   incremental       history.list from the stored cursor: new messages in,
 *                     deleted (or binned) ones out, cursor forward; a cursor
 *                     Google no longer has (404) restarts with a backfill
 *   address_backfill  the same list, narrowed to one address — for a contact
 *                     added after the mailbox was
 *   renew_watch       users.watch on the Pub/Sub topic, daily, since a watch
 *                     lives seven days
 *   revoke            the grant of a disconnected mailbox, revoked at Google
 *
 * Gmail's quota is per user per minute (messages.get is 5 units of 15,000),
 * so a page of 100 fetched in two batches of 50 is comfortably inside it,
 * and a 429 puts the job back with Google's own Retry-After.
 */

export const BACKFILL_DAYS = 365;
export const PAGE_SIZE = 100;
const BATCH_SIZE = 50;
const HISTORY_PAGE_LIMIT = 10;
/** Renew a watch this long before it lapses. */
const WATCH_RENEWAL_MS = 24 * 60 * 60 * 1000;
/** How stale a mailbox may get before the cron polls it — the fallback when no push arrives. */
export const POLL_INTERVAL_MS = 15 * 60 * 1000;
/** Without a Pub/Sub topic the cron IS the sync, so it polls more often. */
export const POLL_INTERVAL_WITHOUT_PUSH_MS = 2 * 60 * 1000;

/** What every mailbox query excludes: nothing a person would call their mail. */
const LIST_EXCLUSIONS = '-in:chats -in:spam -in:trash -is:draft';

export type WorkerDeps = {
	admin: SupabaseClient<Database>;
	config: MailSyncConfig;
	/** Injectable for tests; defaults to the real client over fetch. */
	gmail?: (accessToken: string) => GmailClient;
	fetchImpl?: typeof fetch;
	now?: () => Date;
};

export type DrainSummary = { ran: number; failed: number };

/**
 * Claim and run jobs until none are due or the deadline (epoch ms) is
 * within `margin` — the time one more job could take.
 */
export async function drain(
	deps: WorkerDeps,
	options: { deadline: number; worker: string; batch?: number; marginMs?: number }
): Promise<DrainSummary> {
	const now = deps.now ?? (() => new Date());
	const margin = options.marginMs ?? 20_000;
	const summary: DrainSummary = { ran: 0, failed: 0 };
	// One match index per org per drain: contacts do not change mid-run
	// enough to matter, and building it is the most expensive read here.
	const indexes = new Map<string, Promise<MatchIndex>>();

	while (options.deadline - now().getTime() > margin) {
		const jobs = await claimJobs(deps.admin, options.worker, options.batch ?? 5);
		if (jobs.length === 0) break;
		for (const job of jobs) {
			if (options.deadline - now().getTime() <= margin) {
				// Hand it back untouched; the next invocation claims it.
				await requeueJob(deps.admin, job.id, job.payload);
				continue;
			}
			summary.ran += 1;
			try {
				await runJob(deps, job, indexes);
			} catch (cause) {
				summary.failed += 1;
				const message = cause instanceof Error ? cause.message : String(cause);
				console.error('[mail-sync] job failed', { id: job.id, kind: job.kind, message });
				await failJob(deps.admin, job, message, { now: now() });
			}
		}
	}
	return summary;
}

/**
 * The housekeeping a cron tick does before draining: watches about to lapse
 * are renewed, and mailboxes nobody has pushed about lately are polled.
 * Every enqueue is idempotent (the partial unique index), so a tick that
 * overlaps another adds nothing twice.
 */
export async function scheduleHousekeeping(deps: WorkerDeps): Promise<void> {
	const now = (deps.now ?? (() => new Date()))();
	const mailboxes = unwrap(
		await deps.admin
			.from('mailboxes')
			.select('id, org_id, watch_expires_at, last_synced_at, backfilled_at')
			.eq('status', 'active')
	);
	const pollAfter = deps.config.pubsubTopic ? POLL_INTERVAL_MS : POLL_INTERVAL_WITHOUT_PUSH_MS;

	for (const mailbox of mailboxes) {
		if (deps.config.pubsubTopic) {
			const expires = mailbox.watch_expires_at ? Date.parse(mailbox.watch_expires_at) : 0;
			if (expires - now.getTime() < WATCH_RENEWAL_MS) {
				await enqueueJob(deps.admin, {
					orgId: mailbox.org_id,
					mailboxId: mailbox.id,
					kind: 'renew_watch'
				});
			}
		}
		if (!mailbox.backfilled_at) continue;
		const synced = mailbox.last_synced_at ? Date.parse(mailbox.last_synced_at) : 0;
		if (now.getTime() - synced > pollAfter) {
			await enqueueJob(deps.admin, {
				orgId: mailbox.org_id,
				mailboxId: mailbox.id,
				kind: 'incremental'
			});
		}
	}
}

/** Queue an incremental sync for every active connection of an address (one per org). */
export async function enqueueIncrementalFor(
	admin: SupabaseClient<Database>,
	emailAddress: string
): Promise<number> {
	const mailboxes = unwrap(
		await admin
			.from('mailboxes')
			.select('id, org_id')
			.eq('provider', 'google')
			.eq('email_address', emailAddress.toLowerCase())
			.eq('status', 'active')
	);
	for (const mailbox of mailboxes) {
		await enqueueJob(admin, { orgId: mailbox.org_id, mailboxId: mailbox.id, kind: 'incremental' });
	}
	return mailboxes.length;
}

export async function runJob(
	deps: WorkerDeps,
	job: SyncJob,
	indexes: Map<string, Promise<MatchIndex>> = new Map()
): Promise<void> {
	if (job.kind === 'revoke') {
		await runRevoke(deps, job);
		return;
	}
	if (!job.mailbox_id) throw new Error(`Job ${job.id} names no mailbox.`);

	const mailbox = await loadMailbox(deps.admin, job.mailbox_id);
	if (!mailbox || mailbox.status !== 'active') {
		// Paused or awaiting reconnection: the work is moot, not failed.
		await completeJob(deps.admin, job.id);
		return;
	}

	const access = await accessTokenFor(deps.admin, mailbox, deps.config, {
		fetchImpl: deps.fetchImpl,
		now: deps.now
	});
	if (!access.ok) {
		if (access.reason === 'error') throw new Error(access.error);
		// Nothing to retry until the owner reconnects; the mailbox row says so.
		await completeJob(deps.admin, job.id);
		return;
	}
	const gmail = (deps.gmail ?? ((token) => gmailClient(token, { fetchImpl: deps.fetchImpl })))(
		access.token
	);

	const indexFor = (orgId: string) => {
		let pending = indexes.get(orgId);
		if (!pending) {
			pending = buildMatchIndex(deps.admin, orgId);
			indexes.set(orgId, pending);
		}
		return pending;
	};

	switch (job.kind) {
		case 'backfill':
			await runBackfill(deps, job, mailbox, gmail, await indexFor(mailbox.org_id), null);
			return;
		case 'address_backfill': {
			const address = payloadString(job.payload, 'address');
			if (!address) throw new Error('address_backfill job carries no address.');
			await runBackfill(deps, job, mailbox, gmail, await indexFor(mailbox.org_id), address);
			return;
		}
		case 'incremental':
			await runIncremental(deps, job, mailbox, gmail, await indexFor(mailbox.org_id));
			return;
		case 'renew_watch':
			await runRenewWatch(deps, job, mailbox, gmail);
			return;
	}
}

// ---------------------------------------------------------------------------
// The jobs
// ---------------------------------------------------------------------------

async function runBackfill(
	deps: WorkerDeps,
	job: SyncJob,
	mailbox: MailboxRow,
	gmail: GmailClient,
	index: MatchIndex,
	address: string | null
): Promise<void> {
	const pageToken = payloadString(job.payload, 'pageToken');
	const scope = address
		? `(from:${address} OR to:${address} OR cc:${address} OR bcc:${address}) `
		: '';
	const page = await gmail.listMessages({
		q: `${scope}newer_than:${BACKFILL_DAYS}d ${LIST_EXCLUSIONS}`,
		pageToken: pageToken ?? undefined,
		maxResults: PAGE_SIZE
	});
	if (!page.ok) return handleFailure(deps, job, mailbox, page);

	const exclusions = await loadExclusions(deps.admin, mailbox.id);
	const held = await heldGmailIds(deps.admin, mailbox.id, page.value.ids);
	const wanted = page.value.ids.filter((id) => !held.has(id));
	for (const chunk of chunks(wanted, BATCH_SIZE)) {
		const fetched = await gmail.batchGetMessages(chunk, 'full');
		if (!fetched.ok) return handleFailure(deps, job, mailbox, fetched);
		for (const message of fetched.value) {
			await ingestMessage(deps.admin, mailbox, message, index, exclusions);
		}
	}

	if (page.value.nextPageToken) {
		const payload: Json = address
			? { address, pageToken: page.value.nextPageToken }
			: { pageToken: page.value.nextPageToken };
		await requeueJob(deps.admin, job.id, payload);
		return;
	}

	const now = new Date().toISOString();
	ensure(
		await deps.admin
			.from('mailboxes')
			.update(
				address
					? { last_synced_at: now }
					: { backfilled_at: now, last_synced_at: now, last_error: null }
			)
			.eq('id', mailbox.id)
	);
	await completeJob(deps.admin, job.id);
}

async function runIncremental(
	deps: WorkerDeps,
	job: SyncJob,
	mailbox: MailboxRow,
	gmail: GmailClient,
	index: MatchIndex
): Promise<void> {
	if (!mailbox.history_id) {
		await restartWithBackfill(deps, job, mailbox);
		return;
	}

	const added = new Map<string, string>();
	const removed = new Set<string>();
	let cursor = mailbox.history_id;
	let pageToken: string | undefined;
	for (let pages = 0; pages < HISTORY_PAGE_LIMIT; pages += 1) {
		const page = await gmail.listHistory({
			startHistoryId: mailbox.history_id,
			pageToken,
			historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']
		});
		if (!page.ok) {
			if (page.code === 'not_found') {
				// The cursor is older than Google keeps history: start over.
				await restartWithBackfill(deps, job, mailbox);
				return;
			}
			return handleFailure(deps, job, mailbox, page);
		}
		foldHistory(page.value.history, added, removed);
		cursor = page.value.historyId;
		if (!page.value.nextPageToken) break;
		pageToken = page.value.nextPageToken;
	}

	for (const id of removed) {
		added.delete(id);
		await forgetMessage(deps.admin, mailbox.id, id);
	}

	const exclusions = await loadExclusions(deps.admin, mailbox.id);
	const held = await heldGmailIds(deps.admin, mailbox.id, [...added.keys()]);
	const wanted = [...added.keys()].filter((id) => !held.has(id));
	for (const chunk of chunks(wanted, BATCH_SIZE)) {
		const fetched = await gmail.batchGetMessages(chunk, 'full');
		if (!fetched.ok) return handleFailure(deps, job, mailbox, fetched);
		for (const message of fetched.value) {
			await ingestMessage(deps.admin, mailbox, message, index, exclusions);
		}
	}

	ensure(
		await deps.admin
			.from('mailboxes')
			.update({
				history_id: cursor,
				last_synced_at: new Date().toISOString(),
				last_error: null
			})
			.eq('id', mailbox.id)
	);
	await completeJob(deps.admin, job.id);
}

/**
 * What a run of history records adds up to: the messages to fetch (added,
 * or moved out of spam or the bin) and the ones to let go of (deleted, or
 * moved into either).
 */
export function foldHistory(
	history: readonly GmailHistoryRecord[],
	added: Map<string, string>,
	removed: Set<string>
): void {
	const gone = (labels: readonly string[]) => labels.includes('TRASH') || labels.includes('SPAM');
	for (const record of history) {
		for (const entry of record.messagesAdded ?? []) {
			if (gone(entry.message.labelIds ?? [])) continue;
			added.set(entry.message.id, entry.message.threadId);
			removed.delete(entry.message.id);
		}
		for (const entry of record.labelsRemoved ?? []) {
			if (gone(entry.labelIds)) {
				added.set(entry.message.id, entry.message.threadId);
				removed.delete(entry.message.id);
			}
		}
		for (const entry of record.labelsAdded ?? []) {
			if (gone(entry.labelIds)) {
				removed.add(entry.message.id);
				added.delete(entry.message.id);
			}
		}
		for (const entry of record.messagesDeleted ?? []) {
			removed.add(entry.message.id);
			added.delete(entry.message.id);
		}
	}
}

async function runRenewWatch(
	deps: WorkerDeps,
	job: SyncJob,
	mailbox: MailboxRow,
	gmail: GmailClient
): Promise<void> {
	if (!deps.config.pubsubTopic) {
		await completeJob(deps.admin, job.id);
		return;
	}
	const watch = await gmail.watch(deps.config.pubsubTopic);
	if (!watch.ok) return handleFailure(deps, job, mailbox, watch);
	const renewed: Pick<MailboxRow, 'watch_expires_at'> & Partial<Pick<MailboxRow, 'history_id'>> = {
		watch_expires_at: new Date(Number(watch.value.expiration)).toISOString()
	};
	// A watch answers with the mailbox's current position; a mailbox with no
	// cursor yet takes it, so incremental can start from here.
	if (!mailbox.history_id) renewed.history_id = watch.value.historyId;
	ensure(await deps.admin.from('mailboxes').update(renewed).eq('id', mailbox.id));
	await completeJob(deps.admin, job.id);
}

/** Best effort, once: the grant is told to Google, and the job is done either way. */
async function runRevoke(deps: WorkerDeps, job: SyncJob): Promise<void> {
	const sealed = payloadString(job.payload, 'refresh_token_sealed');
	const token = sealed ? openSecret(sealed, deps.config.key) : null;
	if (token) {
		const revoked = await revokeToken(token, { fetchImpl: deps.fetchImpl });
		if (!revoked) {
			console.warn('[mail-sync] Google did not confirm revoking a token', { job: job.id });
		}
	}
	await completeJob(deps.admin, job.id);
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

async function loadMailbox(
	admin: SupabaseClient<Database>,
	mailboxId: string
): Promise<MailboxRow | null> {
	const rows = unwrap(await admin.from('mailboxes').select('*').eq('id', mailboxId).limit(1));
	return rows[0] ?? null;
}

/** The cursor is gone: forget it, finish this job, and queue a fresh backfill. */
async function restartWithBackfill(deps: WorkerDeps, job: SyncJob, mailbox: MailboxRow) {
	ensure(await deps.admin.from('mailboxes').update({ history_id: null }).eq('id', mailbox.id));
	await completeJob(deps.admin, job.id);
	await enqueueJob(deps.admin, { orgId: mailbox.org_id, mailboxId: mailbox.id, kind: 'backfill' });
}

/**
 * Gmail said no. A dead token stops the mailbox; a rate limit waits as long
 * as Google asks; anything else is an ordinary failure with backoff.
 */
async function handleFailure(
	deps: WorkerDeps,
	job: SyncJob,
	mailbox: MailboxRow,
	failure: GmailFailure
): Promise<void> {
	if (failure.code === 'unauthorized') {
		// Drop the cached access token so the next attempt refreshes; if the
		// refresh fails too, that path marks the mailbox for reconnection.
		ensure(
			await deps.admin
				.from('mailbox_credentials')
				.update({ access_token_sealed: null, access_token_expires_at: null })
				.eq('mailbox_id', mailbox.id)
		);
		if (job.attempts >= 3) await markReauthorize(deps.admin, mailbox, failure.error);
	}
	await failJob(deps.admin, job, `${failure.code}: ${failure.error}`, {
		retryAfterMs: failure.code === 'rate_limited' ? (failure.retryAfterMs ?? 60_000) : null
	});
}

function chunks<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}
