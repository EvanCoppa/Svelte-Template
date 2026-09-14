import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { openSecret, sealSecret, tokenKey } from './tokens';

const key = randomBytes(32);

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('tokenKey', () => {
	it('is unset by default', () => {
		expect(tokenKey({})).toBeNull();
		expect(console.error).not.toHaveBeenCalled();
	});

	it('decodes a 32-byte base64 key', () => {
		expect(tokenKey({ MAILBOX_TOKEN_KEY: key.toString('base64') })?.equals(key)).toBe(true);
	});

	it('refuses (loudly) a key of the wrong size', () => {
		expect(tokenKey({ MAILBOX_TOKEN_KEY: randomBytes(16).toString('base64') })).toBeNull();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('32 bytes'));
	});
});

describe('sealSecret / openSecret', () => {
	it('round-trips a token', () => {
		const sealed = sealSecret('1//0refresh-token', key);
		expect(sealed.startsWith('v1:')).toBe(true);
		expect(sealed).not.toContain('refresh-token');
		expect(openSecret(sealed, key)).toBe('1//0refresh-token');
	});

	it('seals the same token differently every time', () => {
		expect(sealSecret('same', key)).not.toBe(sealSecret('same', key));
	});

	it('opens to nothing under another key', () => {
		expect(openSecret(sealSecret('secret', key), randomBytes(32))).toBeNull();
	});

	it('opens to nothing when a byte changed', () => {
		const sealed = sealSecret('secret', key);
		const parts = sealed.split(':');
		const ciphertext = Buffer.from(parts[3], 'base64url');
		ciphertext[0] ^= 0xff;
		parts[3] = ciphertext.toString('base64url');
		expect(openSecret(parts.join(':'), key)).toBeNull();
	});

	it('opens to nothing for a value it did not seal', () => {
		expect(openSecret('', key)).toBeNull();
		expect(openSecret('v0:a:b:c', key)).toBeNull();
		expect(openSecret('plain-text-token', key)).toBeNull();
	});

	it('keeps unicode intact', () => {
		expect(openSecret(sealSecret('tökén ✓', key), key)).toBe('tökén ✓');
	});
});
