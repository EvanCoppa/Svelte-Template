import { expect, test } from '@playwright/test';

/**
 * The default-deny contract, from the outside.
 *
 * None of these need a database: an unauthenticated request has no session
 * cookie, so `safeGetSession()` returns null without calling Supabase and the
 * guard in hooks.server.ts redirects. That makes this the part of the suite
 * that runs anywhere, including on a fresh clone with no .env at all.
 */
test.describe('unauthenticated visitor', () => {
	test('is redirected from the dashboard to /login', async ({ page }) => {
		await page.goto('/');

		await expect(page).toHaveURL('/login?next=%2F');
		// Asserted via <title>: Card.Title renders a <div>, so there is no
		// heading role on this page to target.
		await expect(page).toHaveTitle('Sign in');
	});

	test('keeps the requested path in ?next= so login can return there', async ({ page }) => {
		await page.goto('/settings');

		await expect(page).toHaveURL('/login?next=%2Fsettings');
		// The value has to survive the POST, so it round-trips through the form.
		await expect(page.locator('input[name="next"]')).toHaveValue('/settings');
	});

	test('guards routes that do not exist, rather than leaking a 404', async ({ page }) => {
		// Default-deny happens in hooks, before routing — so an unknown path is
		// indistinguishable from a real private one to an anonymous visitor.
		await page.goto('/no-such-page');

		await expect(page).toHaveURL('/login?next=%2Fno-such-page');
	});

	test('explains an expired recovery link instead of bouncing to ?next=', async ({ page }) => {
		// /reset-password needs a session the visitor cannot obtain by signing
		// in, so the guard sends a specific error rather than a login loop.
		await page.goto('/reset-password');

		await expect(page).toHaveURL('/login?error=recovery_link_invalid');
		await expect(page.getByText(/password reset link is invalid or has expired/i)).toBeVisible();
	});

	test('renders a sign-in form with a password-reset escape hatch', async ({ page }) => {
		await page.goto('/login');

		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
	});
});

test.describe('security headers', () => {
	test('are set on every response', async ({ page }) => {
		const response = await page.goto('/login');
		const headers = response?.headers() ?? {};

		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

		const csp = headers['content-security-policy'];
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
	});
});
