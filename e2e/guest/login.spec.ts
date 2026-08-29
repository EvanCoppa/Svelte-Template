import { expect, test } from '../support/fixtures';

/**
 * The login page in detail. Everything here is browser-observable and needs
 * no backend: the constraints superforms emits from the zod schema, the
 * hidden mirror that feeds the reset action, and the banners
 * `hooks.server.ts` and `/auth/confirm` set through `?error=`.
 *
 * The action's own behaviour — the enumeration-safe failure message, the
 * open-redirect guard on `next` — is unit-tested in
 * `src/routes/login/page.server.test.ts`, which is where Supabase can be
 * stubbed rather than contacted.
 */
test.describe('login form', () => {
	test('an empty submit never leaves the page', async ({ page }) => {
		await page.goto('/login');

		await page.getByRole('button', { name: 'Sign in' }).click();

		// superforms puts the schema's constraints on the inputs, so the browser
		// refuses the submit itself — no request, no round trip.
		await expect(page.locator('#email:invalid')).toBeVisible();
		await expect(page).toHaveURL('/login');
	});

	test('a malformed email is refused, and accepted once fixed', async ({ page }) => {
		await page.goto('/login');

		await page.getByLabel('Email').fill('not-an-email');
		await page.getByLabel('Password', { exact: true }).fill('hunter2hunter2');
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.locator('#email:invalid')).toBeVisible();
		await expect(page).toHaveURL('/login');

		await page.getByLabel('Email').fill('someone@example.com');
		await expect(page.locator('#email:invalid')).toBeHidden();
	});

	test('the inputs are wired for password managers', async ({ page }) => {
		await page.goto('/login');

		await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'email');
		await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
			'autocomplete',
			'current-password'
		);
	});

	test('forgot password carries the email typed into the login form', async ({ page }) => {
		await page.goto('/login');

		await page.getByLabel('Email').fill('someone@example.com');

		// The reset form has no visible input of its own — it mirrors the login
		// form's email through a hidden field. If that binding breaks, the reset
		// action silently posts an empty address.
		await expect(page.locator('#reset-form input[name="email"]')).toHaveValue(
			'someone@example.com'
		);
		await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeEnabled();
	});

	test('an expired emailed link explains itself', async ({ page }) => {
		await page.goto('/login?error=link_invalid');

		await expect(page.getByRole('alert')).toContainText('invalid or has expired');
	});

	test('an unrecognised error code still says something', async ({ page }) => {
		await page.goto('/login?error=wat');

		await expect(page.getByRole('alert')).toContainText('Something went wrong.');
	});

	test('a completed password reset is confirmed on the way back in', async ({ page }) => {
		await page.goto('/login?reset=success');

		await expect(page.getByRole('alert')).toContainText('Password updated.');
	});
});
