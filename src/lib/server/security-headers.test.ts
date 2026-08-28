import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, buildContentSecurityPolicy } from './security-headers';

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

	it('relaxes connect-src for Vite only in dev', () => {
		expect(buildContentSecurityPolicy(SUPABASE_URL)).not.toContain('ws:');
		expect(buildContentSecurityPolicy(SUPABASE_URL, { dev: true })).toContain('ws:');
	});
});

describe('applySecurityHeaders', () => {
	it('sets the full header set on the response', () => {
		const response = applySecurityHeaders(new Response('ok'), SUPABASE_URL);

		expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
	});
});
