import { describe, expect, it, vi } from 'vitest';
import {
	endPasswordRecovery,
	isPasswordRecovery,
	PASSWORD_RECOVERY_COOKIE,
	startPasswordRecovery
} from './password-recovery';

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
		startPasswordRecovery(cookies as never);
		expect(isPasswordRecovery(cookies)).toBe(true);
		endPasswordRecovery(cookies as never);
		expect(isPasswordRecovery(cookies)).toBe(false);
	});

	it('sets a scoped, HTTP-only, expiring cookie', () => {
		const { cookies } = jar();
		startPasswordRecovery(cookies as never);

		expect(cookies.set).toHaveBeenCalledWith(
			PASSWORD_RECOVERY_COOKIE,
			'1',
			expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 30 })
		);
	});
});
