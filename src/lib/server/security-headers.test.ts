import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, buildContentSecurityPolicy, imageOrigins } from './security-headers';

const SUPABASE_URL = 'https://myproject.supabase.co';

describe('buildContentSecurityPolicy', () => {
	it('derives every Supabase origin from the configured URL', () => {
		const csp = buildContentSecurityPolicy(SUPABASE_URL);

		expect(csp).toContain('connect-src');
		expect(csp).toContain('https://myproject.supabase.co');
		expect(csp).toContain('wss://myproject.supabase.co');
	});

	it('locks down framing, objects, and form targets', () => {
		const csp = buildContentSecurityPolicy(SUPABASE_URL);

		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("form-action 'self'");
		expect(csp).toContain("base-uri 'self'");
	});

	it('admits the map origins for fetches and images, and nothing without a map', () => {
		const csp = buildContentSecurityPolicy(SUPABASE_URL, { mapOrigins: ['https://tiles.test'] });
		const directive = (name: string) => csp.split('; ').find((part) => part.startsWith(name));

		expect(directive('connect-src')).toContain('https://tiles.test');
		expect(directive('img-src')).toContain('https://tiles.test');
		expect(directive('script-src')).not.toContain('https://tiles.test');
		expect(buildContentSecurityPolicy(SUPABASE_URL)).not.toContain('tiles.test');
	});

	it('admits configured image hosts for images only, and nothing when unset', () => {
		const csp = buildContentSecurityPolicy(SUPABASE_URL, {
			imageOrigins: ['https://cdn.test']
		});
		const directive = (name: string) => csp.split('; ').find((part) => part.startsWith(name));

		expect(directive('img-src')).toContain('https://cdn.test');
		expect(directive('connect-src')).not.toContain('https://cdn.test');
		expect(buildContentSecurityPolicy(SUPABASE_URL)).not.toContain('cdn.test');
	});

	it('admits a voice call’s socket for fetches only, and nothing when there is none', () => {
		const csp = buildContentSecurityPolicy(SUPABASE_URL, {
			realtimeOrigins: ['wss://api.test']
		});
		const directive = (name: string) => csp.split('; ').find((part) => part.startsWith(name));

		expect(directive('connect-src')).toContain('wss://api.test');
		expect(directive('img-src')).not.toContain('wss://api.test');
		expect(buildContentSecurityPolicy(SUPABASE_URL)).not.toContain('api.test');
	});

	it('relaxes connect-src for Vite only in dev', () => {
		expect(buildContentSecurityPolicy(SUPABASE_URL)).not.toContain('ws:');
		expect(buildContentSecurityPolicy(SUPABASE_URL, { dev: true })).toContain('ws:');
	});
});

describe('imageOrigins', () => {
	it('reads a comma-separated list as distinct origins', () => {
		expect(
			imageOrigins('https://cdn.test/images/, https://cdn.test/other, https://b.test')
		).toEqual(['https://cdn.test', 'https://b.test']);
	});

	it('is empty when unset, and drops an entry that is not a URL', () => {
		expect(imageOrigins(undefined)).toEqual([]);
		expect(imageOrigins('')).toEqual([]);
		expect(imageOrigins('   ,  ')).toEqual([]);
		// A typo costs one broken thumbnail, never the whole header set.
		expect(imageOrigins('cdn.test, https://ok.test')).toEqual(['https://ok.test']);
	});
});

describe('applySecurityHeaders', () => {
	it('sets the full header set on the response', () => {
		const response = applySecurityHeaders(new Response('ok'), SUPABASE_URL);

		expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		// The microphone is the app's own — dictation, and the audio a call is
		// made of — while camera and location stay refused outright.
		expect(response.headers.get('Permissions-Policy')).toBe(
			'camera=(), microphone=(self), geolocation=()'
		);
	});
});
