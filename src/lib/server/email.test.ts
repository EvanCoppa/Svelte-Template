import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailConfig, isEmailEnabled, sendEmail, type EmailClient, type EmailEnv } from './email';

/** Minimal env where sending is fully configured. */
function configuredEnv(extra: EmailEnv = {}): EmailEnv {
	return {
		RESEND_API_KEY: 're_test_key',
		EMAIL_FROM: 'Acme <hello@acme.test>',
		...extra
	};
}

function clientStub(send?: ReturnType<typeof vi.fn<EmailClient['emails']['send']>>) {
	const resolvedSend = send ?? vi.fn<EmailClient['emails']['send']>();
	if (!send)
		resolvedSend.mockResolvedValue({ data: { id: 'email-1' }, error: null, headers: null });
	const client: EmailClient = { emails: { send: resolvedSend } };
	return { client, send: resolvedSend };
}

const message = {
	to: 'user@example.com',
	subject: 'Hi',
	html: '<p>Hi</p>',
	text: 'Hi'
};

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('emailConfig', () => {
	it('is disabled by default', () => {
		expect(emailConfig({})).toBeNull();
		expect(isEmailEnabled({})).toBe(false);
	});

	it('is enabled with an API key and a sender', () => {
		expect(emailConfig(configuredEnv())).toEqual({
			apiKey: 're_test_key',
			from: 'Acme <hello@acme.test>'
		});
		expect(isEmailEnabled(configuredEnv())).toBe(true);
	});

	it('refuses (loudly) with a key but no sender', () => {
		expect(emailConfig(configuredEnv({ EMAIL_FROM: undefined }))).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('EMAIL_FROM'));
	});

	it('picks up the optional reply-to', () => {
		expect(emailConfig(configuredEnv({ EMAIL_REPLY_TO: 'support@acme.test' }))).toMatchObject({
			replyTo: 'support@acme.test'
		});
	});
});

describe('sendEmail', () => {
	it('reports failure and logs the message instead of sending when unconfigured', async () => {
		const { client, send } = clientStub();

		const result = await sendEmail(message, { createClient: () => client, envSource: {} });

		expect(result).toEqual({ ok: false, error: expect.stringContaining('not configured') });
		expect(send).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('user@example.com'));
	});

	it('sends with the configured defaults and returns the email id', async () => {
		const { client, send } = clientStub();
		const envSource = configuredEnv({ EMAIL_REPLY_TO: 'support@acme.test' });

		const result = await sendEmail(message, { createClient: () => client, envSource });

		expect(result).toEqual({ ok: true, id: 'email-1' });
		expect(send).toHaveBeenCalledWith(
			{ from: 'Acme <hello@acme.test>', replyTo: 'support@acme.test', ...message },
			undefined
		);
	});

	it('lets a message override the from and reply-to defaults', async () => {
		const { client, send } = clientStub();
		const envSource = configuredEnv({ EMAIL_REPLY_TO: 'support@acme.test' });

		await sendEmail(
			{ ...message, from: 'Alerts <alerts@acme.test>', replyTo: 'ops@acme.test' },
			{ createClient: () => client, envSource }
		);

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({ from: 'Alerts <alerts@acme.test>', replyTo: 'ops@acme.test' }),
			undefined
		);
	});

	it('passes the idempotency key as a request option, not a payload field', async () => {
		const { client, send } = clientStub();

		await sendEmail(
			{ ...message, idempotencyKey: 'welcome/user-1' },
			{ createClient: () => client, envSource: configuredEnv() }
		);

		const [payload, options] = send.mock.calls[0];
		expect(options).toEqual({ idempotencyKey: 'welcome/user-1' });
		expect(payload).not.toHaveProperty('idempotencyKey');
	});

	it('reports a rejection from Resend without throwing', async () => {
		const send = vi.fn<EmailClient['emails']['send']>().mockResolvedValue({
			data: null,
			error: { name: 'validation_error', message: 'Invalid `to` address.', statusCode: 422 },
			headers: null
		});
		const { client } = clientStub(send);

		const result = await sendEmail(message, {
			createClient: () => client,
			envSource: configuredEnv()
		});

		expect(result).toEqual({ ok: false, error: 'Invalid `to` address.' });
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid `to` address.'));
	});

	it('reports a network failure without throwing', async () => {
		const send = vi
			.fn<EmailClient['emails']['send']>()
			.mockRejectedValue(new Error('fetch failed'));
		const { client } = clientStub(send);

		const result = await sendEmail(message, {
			createClient: () => client,
			envSource: configuredEnv()
		});

		expect(result).toEqual({ ok: false, error: 'fetch failed' });
	});
});
