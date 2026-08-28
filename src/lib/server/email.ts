/**
 * Transactional email via Resend (https://resend.com/docs).
 *
 * `sendEmail()` is the single way this app sends email. Call it from server
 * code only (form actions, `+server.ts` endpoints, hooks) — this file lives in
 * `src/lib/server/`, so SvelteKit refuses to bundle it client-side. Templates
 * live in `email-templates.ts` and return `{ subject, html, text }`, so a send
 * site composes in one line:
 *
 *     const result = await sendEmail({ to: user.email, ...welcomeEmail({ name }) });
 *     if (!result.ok) console.error(result.error);
 *
 * Configuration is entirely env-driven (`RESEND_API_KEY`, `EMAIL_FROM`,
 * optional `EMAIL_REPLY_TO` — see `.env.example`). When the key is missing the
 * message is logged to the console instead of sent, so email-triggering flows
 * stay exercisable in development without a Resend account, and the result
 * reports failure so callers can decide whether that is fatal.
 *
 * `sendEmail()` never throws: every outcome is a `SendEmailResult`. Decide at
 * the call site whether a failed send should fail the request (e.g. an emailed
 * invite the user is waiting on) or just be logged (e.g. a courtesy
 * notification after a mutation that already succeeded).
 */
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

export interface EmailConfig {
	apiKey: string;
	/** Default sender, `Name <sender@your-domain.com>`. Overridable per send. */
	from: string;
	replyTo?: string;
}

/**
 * The env vars email config reads, injectable so tests can vary them.
 *
 * The index signature matters, not just documents intent: without it this is
 * a TS "weak type" (every property optional), so passing the real
 * `$env/dynamic/private` env — whose generated type is a snapshot of
 * whatever variables happen to be set wherever `svelte-kit sync` last ran —
 * only type-checks when at least one property name coincidentally matches.
 */
export interface EmailEnv {
	RESEND_API_KEY?: string | undefined;
	EMAIL_FROM?: string | undefined;
	EMAIL_REPLY_TO?: string | undefined;
	[key: string]: string | undefined;
}

/**
 * Resolve the email configuration, or `null` when sending is off. Partial
 * configuration is logged loudly — a half-set-up integration should never be
 * silent.
 */
export function emailConfig(source: EmailEnv = env): EmailConfig | null {
	const apiKey = (source.RESEND_API_KEY ?? '').trim();
	if (!apiKey) return null;

	const from = (source.EMAIL_FROM ?? '').trim();
	if (!from) {
		console.error('[email] RESEND_API_KEY is set but EMAIL_FROM is not — email disabled.');
		return null;
	}

	const config: EmailConfig = { apiKey, from };
	const replyTo = (source.EMAIL_REPLY_TO ?? '').trim();
	if (replyTo) config.replyTo = replyTo;
	return config;
}

/** Cheap check for callers that only need to know whether email is live. */
export function isEmailEnabled(source: EmailEnv = env): boolean {
	return emailConfig(source) !== null;
}

export interface EmailMessage {
	/** Recipient address(es); Resend caps a single send at 50. */
	to: string | string[];
	subject: string;
	html: string;
	/**
	 * Plain-text alternative. Resend derives one from `html` when omitted, but
	 * templates from `email-templates.ts` always supply a hand-written one —
	 * better for deliverability and screen readers.
	 */
	text?: string;
	/** Override the `EMAIL_FROM` default for this send. */
	from?: string;
	/** Override the `EMAIL_REPLY_TO` default for this send. */
	replyTo?: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	headers?: Record<string, string>;
	/**
	 * Deduplicates retries of the same logical send for 24h — set it for any
	 * send a user can re-trigger (double-submit, webhook redelivery). Max 256
	 * chars; make it `<event>/<entity-id>`, e.g. `invite/${inviteId}`.
	 */
	idempotencyKey?: string;
	/** ISO 8601 timestamp to send later instead of immediately. */
	scheduledAt?: string;
	/** Resend dashboard metadata, e.g. `[{ name: 'kind', value: 'welcome' }]`. */
	tags?: { name: string; value: string }[];
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

/** The slice of the Resend SDK that `sendEmail` calls. */
export interface EmailClient {
	emails: Pick<InstanceType<typeof Resend>['emails'], 'send'>;
}

export interface SendEmailDeps {
	createClient?: (apiKey: string) => EmailClient;
	envSource?: EmailEnv;
}

/**
 * Send one email. Returns `{ ok: true, id }` on success and `{ ok: false,
 * error }` on any failure (unconfigured, rejected by Resend, or a network
 * error) — it never throws.
 */
export async function sendEmail(
	message: EmailMessage,
	deps: SendEmailDeps = {}
): Promise<SendEmailResult> {
	const config = emailConfig(deps.envSource ?? env);
	const { idempotencyKey, from, replyTo, ...payload } = message;

	if (!config) {
		const to = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
		console.warn(
			`[email] Not configured (set RESEND_API_KEY and EMAIL_FROM) — NOT sending ` +
				`"${payload.subject}" to ${to}. Plain-text body:\n${payload.text ?? payload.html}`
		);
		return { ok: false, error: 'Email is not configured (RESEND_API_KEY / EMAIL_FROM).' };
	}

	const resend = (deps.createClient ?? ((apiKey) => new Resend(apiKey)))(config.apiKey);
	try {
		const { data, error } = await resend.emails.send(
			{
				from: from ?? config.from,
				replyTo: replyTo ?? config.replyTo,
				...payload
			},
			idempotencyKey ? { idempotencyKey } : undefined
		);

		if (error || !data) {
			const reason = error?.message ?? 'Resend returned no email id.';
			console.error(`[email] Send rejected (${error?.name ?? 'unknown'}): ${reason}`);
			return { ok: false, error: reason };
		}
		return { ok: true, id: data.id };
	} catch (err) {
		// The SDK reports API failures via `error` above; reaching here means a
		// network-level failure.
		const reason = err instanceof Error ? err.message : 'Unknown network error.';
		console.error(`[email] Send failed: ${reason}`);
		return { ok: false, error: reason };
	}
}
