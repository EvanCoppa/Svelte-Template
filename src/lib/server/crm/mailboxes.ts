import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Tables } from '$lib/database.types';
import { enqueueJob } from '$lib/server/mail-sync/jobs';
import { ensure, unwrap, unwrapDeleted } from './unwrap';

/**
 * Data access for `mailboxes` and `mailbox_exclusions` — a member's
 * connected email account and what it leaves out.
 *
 * Reads and the member's own writes (visibility, exclusions, disconnect) run
 * on the request-scoped client, so RLS decides: the roster is every
 * member's to see, the connection its owner's to set and to end (owners and
 * admins may end anyone's). Connecting is different: the row is born from
 * what Google answered in the OAuth callback and carries a sealed token, so
 * `connectMailbox()` requires the service-role client — the same rule as a
 * notification's creation.
 */

export type Mailbox = Tables<'mailboxes'>;
export type MailboxExclusion = Tables<'mailbox_exclusions'>;
export type MailboxVisibility = Enums<'mailbox_visibility'>;

/** The org's connected mailboxes, oldest connection first. */
export async function listMailboxes(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<Mailbox[]> {
	return unwrap(
		await supabase.from('mailboxes').select('*').eq('org_id', orgId).order('created_at')
	);
}

/** The caller's own connections in the org — the ones a compose form can send from. */
export async function listOwnMailboxes(
	supabase: SupabaseClient<Database>,
	orgId: string,
	userId: string
): Promise<Mailbox[]> {
	return unwrap(
		await supabase
			.from('mailboxes')
			.select('*')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.order('created_at')
	);
}

export async function getMailbox(
	supabase: SupabaseClient<Database>,
	orgId: string,
	mailboxId: string
): Promise<Mailbox | null> {
	return unwrap(
		await supabase
			.from('mailboxes')
			.select('*')
			.eq('org_id', orgId)
			.eq('id', mailboxId)
			.maybeSingle()
	);
}

export async function updateMailboxVisibility(
	supabase: SupabaseClient<Database>,
	orgId: string,
	mailboxId: string,
	visibility: MailboxVisibility
): Promise<Mailbox> {
	return unwrap(
		await supabase
			.from('mailboxes')
			.update({ visibility })
			.eq('org_id', orgId)
			.eq('id', mailboxId)
			.select()
			.single()
	);
}

/**
 * Disconnect. The database does the rest: the credentials go, the mailbox's
 * copies of every message go (and each message nobody else holds with
 * them), and a `revoke` job tells Google — see the email_sync migration.
 */
export async function deleteMailbox(
	supabase: SupabaseClient<Database>,
	orgId: string,
	mailboxId: string
): Promise<void> {
	unwrapDeleted(
		await supabase.from('mailboxes').delete().eq('org_id', orgId).eq('id', mailboxId).select('id'),
		'Mailbox'
	);
}

/** The caller's exclusions across the org's mailboxes (RLS shows only their own). */
export async function listExclusions(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<MailboxExclusion[]> {
	return unwrap(
		await supabase.from('mailbox_exclusions').select('*').eq('org_id', orgId).order('pattern')
	);
}

export async function addExclusion(
	supabase: SupabaseClient<Database>,
	orgId: string,
	mailboxId: string,
	pattern: string
): Promise<MailboxExclusion> {
	return unwrap(
		await supabase
			.from('mailbox_exclusions')
			.insert({ org_id: orgId, mailbox_id: mailboxId, pattern: pattern.trim().toLowerCase() })
			.select()
			.single()
	);
}

export async function removeExclusion(
	supabase: SupabaseClient<Database>,
	orgId: string,
	exclusionId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('mailbox_exclusions')
			.delete()
			.eq('org_id', orgId)
			.eq('id', exclusionId)
			.select('id'),
		'Exclusion'
	);
}

/**
 * Record a connection Google just granted. `serviceRole` MUST be the
 * service-role client: the table has no insert policy and the credentials
 * table no policy at all. Reconnecting an address the member already had
 * (after a revocation, say) revives the same row — its history stays — and
 * the two jobs that start a mailbox off are queued: a backfill, and a watch.
 */
export async function connectMailbox(
	serviceRole: SupabaseClient<Database>,
	values: {
		orgId: string;
		userId: string;
		emailAddress: string;
		historyId: string;
		refreshTokenSealed: string;
		accessTokenSealed: string;
		accessTokenExpiresAt: string;
		scopes: string[];
	}
): Promise<Mailbox> {
	const mailbox = unwrap(
		await serviceRole
			.from('mailboxes')
			.upsert(
				{
					org_id: values.orgId,
					user_id: values.userId,
					provider: 'google',
					email_address: values.emailAddress.toLowerCase(),
					status: 'active',
					history_id: values.historyId,
					last_error: null
				},
				{ onConflict: 'org_id,user_id,provider,email_address' }
			)
			.select()
			.single()
	);

	ensure(
		await serviceRole.from('mailbox_credentials').upsert(
			{
				mailbox_id: mailbox.id,
				refresh_token_sealed: values.refreshTokenSealed,
				access_token_sealed: values.accessTokenSealed,
				access_token_expires_at: values.accessTokenExpiresAt,
				scopes: values.scopes
			},
			{ onConflict: 'mailbox_id' }
		)
	);

	await enqueueJob(serviceRole, { orgId: mailbox.org_id, mailboxId: mailbox.id, kind: 'backfill' });
	await enqueueJob(serviceRole, {
		orgId: mailbox.org_id,
		mailboxId: mailbox.id,
		kind: 'renew_watch'
	});
	return mailbox;
}
