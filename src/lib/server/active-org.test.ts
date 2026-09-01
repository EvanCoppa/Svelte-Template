import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_MAX_AGE, readActiveOrg, setActiveOrg } from './active-org';

const ORG_ID = '10000000-0000-0000-0000-000000000001';

describe('active-org cookie helpers', () => {
	function jar() {
		const store: Record<string, string> = {};
		return {
			store,
			cookies: {
				get: (name: string) => store[name],
				set: vi.fn((name: string, value: string) => {
					store[name] = value;
				})
			}
		};
	}

	it('round-trips a set organization id', () => {
		const { cookies } = jar();

		expect(readActiveOrg(cookies)).toBeNull();
		setActiveOrg(cookies, ORG_ID);
		expect(readActiveOrg(cookies)).toBe(ORG_ID);
	});

	it('rejects a cookie value that is not a UUID', () => {
		const { store, cookies } = jar();

		for (const forged of ['', 'not-a-uuid', '1; drop table organizations', `${ORG_ID}x`]) {
			store[ACTIVE_ORG_COOKIE] = forged;
			expect(readActiveOrg(cookies)).toBeNull();
		}
	});

	it('sets a scoped, HTTP-only, long-lived cookie', () => {
		const { cookies } = jar();
		setActiveOrg(cookies, ORG_ID);

		expect(cookies.set).toHaveBeenCalledWith(
			ACTIVE_ORG_COOKIE,
			ORG_ID,
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: ACTIVE_ORG_MAX_AGE
			})
		);
	});
});
