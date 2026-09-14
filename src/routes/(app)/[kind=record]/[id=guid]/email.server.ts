import { error, fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { message, superValidate, type SuperValidated } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Infer } from 'sveltekit-superforms';
import { recordKindForSegment, type RecordKind, type RecordSegment } from '$lib/crm/records';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { gmailClient } from '$lib/server/integrations/google/gmail';
import { buildRawMessage } from '$lib/server/integrations/google/mime';
import {
	getEmailMessage,
	listEmailThreadsFor,
	setMailboxMessagePrivate,
	type EmailThreadView
} from '$lib/server/crm/emails';
import { getMailbox, listOwnMailboxes } from '$lib/server/crm/mailboxes';
import { unwrap } from '$lib/server/crm/unwrap';
import { emailAccess } from '$lib/server/mail-sync/access';
import {
	isMailSyncConfigured,
	mailSyncConfig,
	type MailSyncEnv
} from '$lib/server/mail-sync/config';
import { accessTokenFor } from '$lib/server/mail-sync/credentials';
import { buildMatchIndex, ingestMessage, loadExclusions } from '$lib/server/mail-sync/ingest';
import { getDisplayNames } from '$lib/server/profiles';
import { requirePermission } from '$lib/server/roles';
import { composeEmailSchema, setMessagePrivateSchema, splitRecipients } from '$lib/schemas/email';
import type { Actions } from './$types';

/**
 * The email block of the record page — the conversations filed on this
 * record, and the two acts a reader may take on them: write (a new message,
 * or a reply that stays in the thread) and flag a message of their own
 * mailbox private. The generic page draws it whenever the load supplies
 * `data.email`, the data-presence rule the billing block and the task
 * thread follow, so the page stays one renderer.
 *
 * Reading is the `email` feature's `read` grant plus the mailbox visibility
 * rule in RLS; sending is `manage` AND a connected mailbox of the sender's
 * own — you can only ever send as yourself. A sent message is ingested at
 * once, filed on this record whatever its addresses match, so it appears
 * before Gmail's push comes round.
 */

export const EMAIL_FORM_IDS = {
	compose: 'compose-email',
	privacy: 'email-privacy'
} as const;

/** The kinds a message can be filed on — the `email_message_links_kind` check. */
const LINKABLE = new Set<RecordKind>(['company', 'contact', 'deal']);

function isLinkable(kind: RecordKind): kind is 'company' | 'contact' | 'deal' {
	return LINKABLE.has(kind);
}

export type SendFrom = { id: string; emailAddress: string };

export type RecordEmail = {
	threads: EmailThreadView[];
	/** The reader's own active mailboxes — what the compose form can send from. */
	mailboxes: SendFrom[];
	composeForm: SuperValidated<Infer<typeof composeEmailSchema>>;
	privacyForm: SuperValidated<Infer<typeof setMessagePrivateSchema>>;
	/** May write: the manage grant and at least one mailbox to send from. */
	canSend: boolean;
	/** May connect a mailbox — the manage grant, with none connected yet. */
	canConnect: boolean;
	configured: boolean;
	userId: string;
	/** Owner or admin: sees every mailbox's mail, so a private badge means "to the rest". */
	isOrgManager: boolean;
};

/**
 * `source` is the deployment's environment, injectable so a test can stand
 * up a configured deployment without touching the process — the
 * `geocoderConfig(source)` convention.
 */
export async function loadEmail(
	locals: App.Locals,
	params: { kind: RecordSegment; id: string },
	source?: MailSyncEnv
): Promise<RecordEmail | null> {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	if (!isLinkable(kind)) return null;

	const access = emailAccess(org);
	if (!access.canRead) return null;
	const configured = isMailSyncConfigured(source);

	const [threads, own, recipient] = await Promise.all([
		listEmailThreadsFor(supabase, activeOrgId, { entityType: kind, entityId: params.id }),
		access.canManage ? listOwnMailboxes(supabase, activeOrgId, user.id) : [],
		access.canManage ? recipientAddress(supabase, activeOrgId, kind, params.id) : null
	]);
	const mailboxes = own
		.filter((mailbox) => mailbox.status === 'active')
		.map((mailbox) => ({ id: mailbox.id, emailAddress: mailbox.email_address }));

	const [composeForm, privacyForm] = await Promise.all([
		superValidate(
			{
				mailbox_id: mailboxes[0]?.id ?? '',
				to: recipient ?? '',
				// Minted here and posted back, so a double submit collides on the
				// outbox instead of sending twice.
				idempotency_key: randomUUID()
			},
			zod4(composeEmailSchema),
			{ id: EMAIL_FORM_IDS.compose, errors: false }
		),
		superValidate(zod4(setMessagePrivateSchema), { id: EMAIL_FORM_IDS.privacy })
	]);

	return {
		threads,
		mailboxes,
		composeForm,
		privacyForm,
		canSend: access.canManage && configured && mailboxes.length > 0,
		canConnect: access.canManage && configured && mailboxes.length === 0,
		configured,
		userId: user.id,
		isOrgManager: org.activeOrg.role === 'owner' || org.activeOrg.role === 'admin'
	};
}

/** The record's own address, to start the To line with. A deal has none. */
async function recipientAddress(
	supabase: App.Locals['supabase'],
	orgId: string,
	kind: 'company' | 'contact' | 'deal',
	id: string
): Promise<string | null> {
	if (kind === 'deal') return null;
	const rows = unwrap(
		await supabase
			.from(kind === 'contact' ? 'contacts' : 'companies')
			.select('email')
			.eq('org_id', orgId)
			.eq('id', id)
			.limit(1)
	);
	return rows[0]?.email ?? null;
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

/** The org and the record this request acts on, at the level the act needs. */
function recordOf(
	locals: App.Locals,
	params: { kind: RecordSegment; id: string },
	level: 'read' | 'manage'
) {
	const { supabase, org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');
	const kind = recordKindForSegment(params.kind);
	if (!isLinkable(kind)) throw error(400, 'This kind of record carries no email.');
	if (!emailAccess(org).canRead) throw error(403, 'Email is not available here.');
	if (level === 'manage') requirePermission(org.access, 'email', 'manage');
	return { supabase, org, orgId: activeOrgId, user, kind, id: params.id };
}

export const emailActions: Actions = {
	sendEmail: async ({ request, locals, params }) => {
		const { supabase, orgId, user, kind, id } = recordOf(locals, params, 'manage');
		const form = await superValidate(request, zod4(composeEmailSchema), {
			id: EMAIL_FORM_IDS.compose
		});
		if (!form.valid) return fail(400, { form });

		const config = mailSyncConfig();
		if (!config)
			return message(form, 'Email sync is not configured on this server.', { status: 503 });

		// The mailbox must be the sender's own and live; RLS shows the row to
		// every member, so the owner check is explicit here.
		const mailbox = await getMailbox(supabase, orgId, form.data.mailbox_id);
		if (!mailbox || mailbox.user_id !== user.id) {
			return message(form, 'Pick one of your own connected mailboxes.', { status: 400 });
		}
		if (mailbox.status !== 'active') {
			return message(form, 'That mailbox needs reconnecting before it can send.', {
				status: 400
			});
		}

		// A reply carries its parent's thread and subject.
		const parent =
			form.data.in_reply_to === ''
				? null
				: await getEmailMessage(supabase, orgId, form.data.in_reply_to);
		if (form.data.in_reply_to !== '' && !parent) {
			return message(form, 'The message you are replying to is no longer here.', { status: 400 });
		}
		const subject =
			form.data.subject ||
			(parent?.subject
				? /^re:/i.test(parent.subject)
					? parent.subject
					: `Re: ${parent.subject}`
				: '');
		const to = splitRecipients(form.data.to);
		const cc = splitRecipients(form.data.cc);
		const bcc = splitRecipients(form.data.bcc);

		// The ledger row first: a second post with the same key collides here
		// and nothing goes out twice — unless the earlier post was refused by
		// Google, in which case the same key is a retry and the row is reused.
		let outboxId: string;
		const queued = await supabase
			.from('email_outbox')
			.insert({
				org_id: orgId,
				mailbox_id: mailbox.id,
				user_id: user.id,
				idempotency_key: form.data.idempotency_key,
				to_addresses: to,
				cc_addresses: cc,
				bcc_addresses: bcc,
				subject,
				body_text: form.data.body,
				in_reply_to_message_id: parent?.id ?? null
			})
			.select('id')
			.single();
		if (queued.error) {
			if (queued.error.code !== '23505') {
				return message(form, queued.error.message, { status: 400 });
			}
			const earlier = unwrap(
				await supabase
					.from('email_outbox')
					.select('id, status')
					.eq('mailbox_id', mailbox.id)
					.eq('idempotency_key', form.data.idempotency_key)
					.maybeSingle()
			);
			if (!earlier || earlier.status !== 'failed') return { form };
			outboxId = earlier.id;
		} else {
			outboxId = queued.data.id;
		}

		const admin = createSupabaseAdminClient();
		const outcome = async (values: {
			status: 'sent' | 'failed';
			gmail_message_id?: string;
			error?: string;
		}) =>
			admin
				.from('email_outbox')
				.update({
					...values,
					sent_at: values.status === 'sent' ? new Date().toISOString() : null
				})
				.eq('id', outboxId);

		const access = await accessTokenFor(admin, mailbox, config);
		if (!access.ok) {
			await outcome({ status: 'failed', error: access.error });
			return message(
				form,
				access.reason === 'reauthorize'
					? 'Google no longer accepts this mailbox. Reconnect it under Settings → Integrations.'
					: 'Could not reach Google to send. Try again in a moment.',
				{ status: 502 }
			);
		}

		const names = await getDisplayNames(supabase, [user.id]);
		const raw = buildRawMessage({
			from: { address: mailbox.email_address, name: names.get(user.id) ?? null },
			to: to.map((address) => ({ address, name: null })),
			cc: cc.map((address) => ({ address, name: null })),
			bcc: bcc.map((address) => ({ address, name: null })),
			subject,
			text: form.data.body,
			inReplyTo: parent?.rfc_message_id ?? null,
			references: parent ? [...parent.reference_ids, parent.rfc_message_id] : []
		});
		const gmail = gmailClient(access.token);
		// Threaded under the sender's own copy of the conversation, when they have one.
		const ownCopy = parent?.copies.find((copy) => copy.mailboxId === mailbox.id) ?? null;
		const sent = await gmail.sendMessage(raw, ownCopy?.gmailThreadId ?? null);
		if (!sent.ok) {
			await outcome({ status: 'failed', error: sent.error });
			return message(form, `Google refused the message: ${sent.error}`, { status: 502 });
		}
		await outcome({ status: 'sent', gmail_message_id: sent.value.id });

		// Show it now rather than when the push arrives — filed on this record
		// whatever its addresses match, since it was written from here.
		const fetched = await gmail.getMessage(sent.value.id, 'full');
		if (fetched.ok) {
			const [index, exclusions] = await Promise.all([
				buildMatchIndex(admin, orgId),
				loadExclusions(admin, mailbox.id)
			]);
			await ingestMessage(admin, mailbox, fetched.value, index, exclusions, {
				extraLinks: [{ entityType: kind, entityId: id, source: 'manual' }]
			});
		}
		return { form };
	},

	setMessagePrivate: async ({ request, locals, params }) => {
		const { supabase, orgId } = recordOf(locals, params, 'read');
		const form = await superValidate(request, zod4(setMessagePrivateSchema), {
			id: EMAIL_FORM_IDS.privacy
		});
		if (!form.valid) return fail(400, { form });
		try {
			await setMailboxMessagePrivate(supabase, orgId, form.data.id, form.data.private);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not update.', {
				status: 400
			});
		}
		return { form };
	}
};
