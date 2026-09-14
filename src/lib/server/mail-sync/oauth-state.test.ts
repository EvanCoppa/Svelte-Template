import { describe, expect, it, vi } from 'vitest';
import {
	GOOGLE_OAUTH_COOKIE,
	endGoogleOAuth,
	googleCallbackUrl,
	readGoogleOAuth,
	startGoogleOAuth
} from './oauth-state';

const state = {
	state: 'state-token-of-sixteen-plus',
	verifier: 'v'.repeat(64),
	orgId: '10000000-0000-0000-0000-000000000001',
	userId: '00000000-0000-0000-0000-000000000001'
};

describe('the Google consent cookie', () => {
	it('is written scoped to the callback, httpOnly, for ten minutes', () => {
		const set = vi.fn();
		startGoogleOAuth({ set }, state);
		expect(set).toHaveBeenCalledWith(
			GOOGLE_OAUTH_COOKIE,
			JSON.stringify(state),
			expect.objectContaining({
				path: '/api/integrations/google',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 600
			})
		);
	});

	it('reads back what it wrote', () => {
		expect(readGoogleOAuth({ get: () => JSON.stringify(state) })).toEqual(state);
	});

	it('reads nothing for a missing, malformed or incomplete cookie', () => {
		expect(readGoogleOAuth({ get: () => undefined })).toBeNull();
		expect(readGoogleOAuth({ get: () => 'not json' })).toBeNull();
		expect(readGoogleOAuth({ get: () => JSON.stringify({ state: 'x' }) })).toBeNull();
	});

	it('is deleted on the same path it was set on', () => {
		const del = vi.fn();
		endGoogleOAuth({ delete: del });
		expect(del).toHaveBeenCalledWith(GOOGLE_OAUTH_COOKIE, { path: '/api/integrations/google' });
	});

	it('names the callback from the origin', () => {
		expect(googleCallbackUrl('https://app.example')).toBe(
			'https://app.example/api/integrations/google/callback'
		);
	});
});
