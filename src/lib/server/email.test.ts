import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockSend } = vi.hoisted(() => {
	const mockEnv: Record<string, string | undefined> = {};
	const mockSend = vi.fn();
	return { mockEnv, mockSend };
});

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('resend', () => ({
	Resend: class {
		emails = { send: mockSend };
	}
}));

import { emailConfig, isEmailEnabled, sendEmail } from './email';

function setEnv(values: Record<string, string | undefined>) {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	Object.assign(mockEnv, values);
}

/** Minimal env where sending is fully configured. */
function configuredEnv(extra: Record<string, string | undefined> = {}) {
	setEnv({
		RESEND_API_KEY: 're_test_key',
		EMAIL_FROM: 'Acme <hello@acme.test>',
		...extra
	});
}

const message = {
	to: 'user@example.com',
	subject: 'Hi',
	html: '<p>Hi</p>',
	text: 'Hi'
};

beforeEach(() => {
	setEnv({});
	mockSend.mockReset();
	mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('emailConfig', () => {
	it('is disabled by default', () => {
		expect(emailConfig()).toBeNull();
		expect(isEmailEnabled()).toBe(false);
	});

	it('is enabled with an API key and a sender', () => {
		configuredEnv();
		expect(emailConfig()).toEqual({ apiKey: 're_test_key', from: 'Acme <hello@acme.test>' });
		expect(isEmailEnabled()).toBe(true);
	});

	it('refuses (loudly) with a key but no sender', () => {
		configuredEnv({ EMAIL_FROM: undefined });
		expect(emailConfig()).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('EMAIL_FROM'));
	});

	it('picks up the optional reply-to', () => {
		configuredEnv({ EMAIL_REPLY_TO: 'support@acme.test' });
		expect(emailConfig()).toMatchObject({ replyTo: 'support@acme.test' });
	});
});

describe('sendEmail', () => {
	it('reports failure and logs the message instead of sending when unconfigured', async () => {
		const result = await sendEmail(message);

		expect(result).toEqual({ ok: false, error: expect.stringContaining('not configured') });
		expect(mockSend).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('user@example.com'));
	});

	it('sends with the configured defaults and returns the email id', async () => {
		configuredEnv({ EMAIL_REPLY_TO: 'support@acme.test' });

		const result = await sendEmail(message);

		expect(result).toEqual({ ok: true, id: 'email-1' });
		expect(mockSend).toHaveBeenCalledWith(
			{ from: 'Acme <hello@acme.test>', replyTo: 'support@acme.test', ...message },
			undefined
		);
	});

	it('lets a message override the from and reply-to defaults', async () => {
		configuredEnv({ EMAIL_REPLY_TO: 'support@acme.test' });

		await sendEmail({ ...message, from: 'Alerts <alerts@acme.test>', replyTo: 'ops@acme.test' });

		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({ from: 'Alerts <alerts@acme.test>', replyTo: 'ops@acme.test' }),
			undefined
		);
	});

	it('passes the idempotency key as a request option, not a payload field', async () => {
		configuredEnv();

		await sendEmail({ ...message, idempotencyKey: 'welcome/user-1' });

		const [payload, options] = mockSend.mock.calls[0] as [Record<string, unknown>, unknown];
		expect(options).toEqual({ idempotencyKey: 'welcome/user-1' });
		expect(payload).not.toHaveProperty('idempotencyKey');
	});

	it('reports a rejection from Resend without throwing', async () => {
		configuredEnv();
		mockSend.mockResolvedValue({
			data: null,
			error: { name: 'validation_error', message: 'Invalid `to` address.' }
		});

		const result = await sendEmail(message);

		expect(result).toEqual({ ok: false, error: 'Invalid `to` address.' });
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid `to` address.'));
	});

	it('reports a network failure without throwing', async () => {
		configuredEnv();
		mockSend.mockRejectedValue(new Error('fetch failed'));

		const result = await sendEmail(message);

		expect(result).toEqual({ ok: false, error: 'fetch failed' });
	});
});
