import { describe, expect, it, vi } from 'vitest';
import {
	endPasswordRecovery,
	isPasswordRecovery,
	PASSWORD_MIN_LENGTH,
	PASSWORD_RECOVERY_COOKIE,
	startPasswordRecovery,
	validateNewPassword
} from './password-recovery';

describe('validateNewPassword', () => {
	it('accepts a matching pair that meets the rules', () => {
		expect(validateNewPassword('a-fine-password', 'a-fine-password')).toBeNull();
	});

	it('rejects a password below the minimum length', () => {
		const short = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);
		expect(validateNewPassword(short, short)).toMatch(/at least/);
	});

	it('rejects a password over 72 bytes, which bcrypt would silently truncate', () => {
		// 24 four-byte emoji = 96 bytes but only 48 UTF-16 code units, so a
		// naive .length check would pass it.
		const emoji = '🔑'.repeat(24);
		expect(emoji.length).toBeLessThan(72);
		expect(validateNewPassword(emoji, emoji)).toMatch(/72 bytes/);
	});

	it('rejects a mismatched confirmation', () => {
		expect(validateNewPassword('a-fine-password', 'a-fine-passw0rd')).toMatch(/do not match/);
	});
});

describe('recovery cookie helpers', () => {
	function jar() {
		const store: Record<string, string> = {};
		return {
			store,
			cookies: {
				get: (name: string) => store[name],
				set: vi.fn((name: string, value: string) => {
					store[name] = value;
				}),
				delete: vi.fn((name: string) => {
					delete store[name];
				})
			}
		};
	}

	it('round-trips: start marks the browser, end clears it', () => {
		const { cookies } = jar();

		expect(isPasswordRecovery(cookies)).toBe(false);
		startPasswordRecovery(cookies);
		expect(isPasswordRecovery(cookies)).toBe(true);
		endPasswordRecovery(cookies);
		expect(isPasswordRecovery(cookies)).toBe(false);
	});

	it('sets a scoped, HTTP-only, expiring cookie', () => {
		const { cookies } = jar();
		startPasswordRecovery(cookies);

		expect(cookies.set).toHaveBeenCalledWith(
			PASSWORD_RECOVERY_COOKIE,
			'1',
			expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 30 })
		);
	});
});
