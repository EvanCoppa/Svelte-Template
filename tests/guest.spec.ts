import { expect, test } from './fixtures';
import { guardedRoutes } from './routes';

/**
 * The default-deny contract, from the outside.
 *
 * None of these need a database: an unauthenticated request has no session
 * cookie, so `safeGetSession()` returns null without calling Supabase and the
 * guard in hooks.server.ts redirects. That makes this the part of the suite
 * that runs anywhere, including on a fresh clone with no .env at all.
 */
test.describe('unauthenticated visitor', () => {
	// The route list comes from src/routes, so a page added under `(app)` is
	// swept here the moment it exists — nothing to add below.
	for (const pathname of guardedRoutes()) {
		test(`is redirected from ${pathname} to /login`, async ({ page }) => {
			await page.goto(pathname);

			await expect(page).toHaveURL(`/login?next=${encodeURIComponent(pathname)}`);
			// Asserted via <title>: Card.Title renders a <div>, so there is no
			// heading role on this page to target.
			await expect(page).toHaveTitle('Sign in');
		});
	}

	test('keeps the requested path in ?next= so login can return there', async ({ page }) => {
		await page.goto('/settings?tab=profile');

		// The query string is part of the destination, not just the path.
		await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/settings?tab=profile')}`);
		// The value has to survive the POST, so it round-trips through the form.
		await expect(page.locator('input[name="next"]')).toHaveValue('/settings?tab=profile');
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

/**
 * The login form in detail — still no database, because none of it gets as far
 * as a request. Note where validation surfaces: superforms projects the zod
 * schema onto the inputs as HTML constraints, so a single-field violation is
 * refused by the *browser* and never reaches superforms' own validators.
 * There is no inline message to assert on, only an invalid input and a form
 * that did not submit. The action's own behaviour — the enumeration-safe
 * failure message, the `next` open-redirect guard — is unit-tested in
 * src/routes/login/page.server.test.ts.
 */
test.describe('the login form', () => {
	test('refuses an empty submit without leaving the page', async ({ page }) => {
		await page.goto('/login');

		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.locator('#email:invalid')).toBeVisible();
		await expect(page).toHaveURL('/login');
	});

	test('refuses a malformed email, and accepts it once fixed', async ({ page }) => {
		await page.goto('/login');

		await page.getByLabel('Email').fill('not-an-email');
		await page.getByLabel('Password').fill('hunter2hunter2');
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.locator('#email:invalid')).toBeVisible();
		await expect(page).toHaveURL('/login');

		await page.getByLabel('Email').fill('someone@example.com');
		await expect(page.locator('#email:invalid')).toBeHidden();
	});

	test('is wired for password managers', async ({ page }) => {
		await page.goto('/login');

		await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'email');
		await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
	});

	test('carries the typed email into the reset action', async ({ page }) => {
		await page.goto('/login');

		await page.getByLabel('Email').fill('someone@example.com');

		// The reset form has no visible input of its own — it mirrors the login
		// form's email through a hidden field. If that binding breaks, "forgot
		// password" silently posts an empty address.
		await expect(page.locator('#reset-form input[name="email"]')).toHaveValue(
			'someone@example.com'
		);
	});

	test('explains an emailed link that has expired', async ({ page }) => {
		await page.goto('/login?error=link_invalid');

		await expect(page.getByRole('alert')).toContainText('invalid or has expired');
	});

	test('says something even for an error code it does not know', async ({ page }) => {
		await page.goto('/login?error=wat');

		await expect(page.getByRole('alert')).toContainText('Something went wrong.');
	});

	test('confirms a completed password reset on the way back in', async ({ page }) => {
		await page.goto('/login?reset=success');

		await expect(page.getByRole('alert')).toContainText('Password updated.');
	});
});

test.describe('security headers', () => {
	test('are set on every response', async ({ page }) => {
		const response = await page.goto('/login');
		const headers = response?.headers() ?? {};

		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
		expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');

		const csp = headers['content-security-policy'];
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
	});
});
