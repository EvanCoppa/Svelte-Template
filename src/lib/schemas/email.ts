import { z } from 'zod';
import { Constants } from '$lib/database.types';

/**
 * The forms around synced email: composing a message on a record page, and
 * the mailbox settings under /settings/integrations. Every field posts a
 * string (the record form's rule); the actions turn them into columns.
 */

/** `a@b.com, Name <c@d.com>` → the addresses, lower-cased, in order, each once. */
export function splitRecipients(value: string): string[] {
	const out: string[] = [];
	for (const token of value.split(/[,;\n]/)) {
		const trimmed = token.trim();
		if (!trimmed) continue;
		const angled = /<([^<>]+)>\s*$/.exec(trimmed);
		const address = (angled ? angled[1] : trimmed).trim().toLowerCase();
		if (!out.includes(address)) out.push(address);
	}
	return out;
}

const address = z.email();

/** A comma-separated list of addresses, or nothing. */
const recipients = z
	.string()
	.trim()
	.max(2000)
	.default('')
	.refine((value) => splitRecipients(value).every((entry) => address.safeParse(entry).success), {
		error: 'Enter email addresses separated by commas.'
	});

/**
 * Compose. `idempotency_key` is minted by the load and posted back, so a
 * double submit collides on the outbox instead of mailing twice.
 * `in_reply_to` names the message being answered (its thread and subject
 * carry over); blank is a new conversation, which then needs a subject.
 */
export const composeEmailSchema = z
	.object({
		mailbox_id: z.guid('Pick which mailbox to send from.'),
		to: recipients.refine((value) => splitRecipients(value).length > 0, {
			error: 'Add at least one recipient.'
		}),
		cc: recipients,
		bcc: recipients,
		subject: z.string().trim().max(500, 'Keep the subject under 500 characters.').default(''),
		body: z
			.string()
			.trim()
			.min(1, 'Write something first.')
			.max(50000, 'Keep the message under 50,000 characters.'),
		in_reply_to: z.guid().or(z.literal('')).default(''),
		idempotency_key: z.guid()
	})
	.refine((data) => data.in_reply_to !== '' || data.subject !== '', {
		error: 'A new message needs a subject.',
		path: ['subject']
	});

/** Flag one mailbox's copy of a message private, or unflag it. */
export const setMessagePrivateSchema = z.object({
	id: z.guid(),
	private: z.boolean()
});

export const mailboxVisibilitySchema = z.object({
	id: z.guid(),
	visibility: z.enum(Constants.public.Enums.mailbox_visibility)
});

/** A whole address, or `@` and a domain — the table's own check, said first. */
export const exclusionSchema = z.object({
	mailbox_id: z.guid(),
	pattern: z
		.string()
		.trim()
		.toLowerCase()
		.min(3)
		.max(320)
		.regex(/^(@[^@\s]+|[^@\s]+@[^@\s]+)$/, 'Enter an address (a@b.com) or a domain (@b.com).')
});

export const mailboxIdSchema = z.object({ id: z.guid() });
