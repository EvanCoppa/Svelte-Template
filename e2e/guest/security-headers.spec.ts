import { expect, test } from '../support/fixtures';

/**
 * `src/lib/server/security-headers.test.ts` pins the header values; this pins
 * that they actually reach the browser, on the built app, through whatever
 * the adapter and the preview server do to a response. A header dropped in
 * transit is invisible to a unit test.
 */
test('every response carries the security header set', async ({ page }) => {
	const response = await page.goto('/login');
	const headers = response?.headers() ?? {};

	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');

	const csp = headers['content-security-policy'] ?? '';
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("object-src 'none'");
	// The Supabase origin is derived from PUBLIC_SUPABASE_URL, never hardcoded.
	expect(csp).toContain(new URL(process.env.PUBLIC_SUPABASE_URL ?? 'https://example.com').origin);
});
