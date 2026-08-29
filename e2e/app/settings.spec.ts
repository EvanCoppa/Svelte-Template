import { expect, test } from '../support/fixtures';
import { e2eCredentials } from '../support/session';

/**
 * /settings in detail — the template's reference page for the two mutation
 * patterns: a form action writing a typed, RLS-protected row, and one calling
 * Supabase Auth.
 *
 * Note where each kind of validation surfaces. superforms projects the zod
 * schema onto the inputs as HTML constraints, so a single-field violation
 * (too short, too long, missing) is refused by the browser and never reaches
 * superforms' own validators. Only what HTML cannot express — the
 * cross-field refinement on the password confirmation — renders as an inline
 * superforms error. Both are worth pinning; they just look different.
 */
test.describe('settings', () => {
	test('the account card reports the session the server resolved', async ({ page }) => {
		const credentials = e2eCredentials();
		if (!credentials) throw new Error('[e2e] Missing credentials for the signed-in tier.');

		await page.goto('/settings');

		// The address appears twice — the account card and the sidebar footer —
		// and both come from the same verified session.
		await expect(page.getByText(credentials.email).first()).toBeVisible();
	});

	test('saving the profile toasts and survives a reload', async ({ page }) => {
		await page.goto('/settings');

		// A project that has not applied the starter migration renders a hint
		// instead of the form. Say so loudly rather than reporting a pass.
		test.skip(
			await page.getByText('No profile row found').isVisible(),
			'No profiles row for the test account — apply supabase/migrations/ first.'
		);

		const displayName = `E2E ${String(Date.now())}`;
		await page.getByLabel('Display name').fill(displayName);
		await page.getByRole('button', { name: 'Save profile' }).click();

		// House convention: successes toast, they do not render a banner.
		await expect(page.getByText('Profile updated')).toBeVisible();

		await page.reload();
		await expect(page.getByLabel('Display name')).toHaveValue(displayName);
	});

	test('an over-long display name never reaches the server', async ({ page }) => {
		await page.goto('/settings');
		test.skip(
			await page.getByText('No profile row found').isVisible(),
			'No profiles row for the test account — apply supabase/migrations/ first.'
		);

		await page.getByLabel('Display name').fill('x'.repeat(101));
		await page.getByRole('button', { name: 'Save profile' }).click();

		// maxlength comes from the schema's `.max(100)` via superforms.
		await expect(page.locator('#display_name:invalid')).toBeVisible();
		await expect(page.getByText('Profile updated')).toBeHidden();
	});

	// The password form is exercised only through its failure paths on purpose:
	// actually changing the password would invalidate the account for every
	// later run. `src/routes/reset-password/page.server.test.ts` covers a
	// successful change.
	test('a mismatched confirmation is caught inline, before the request', async ({ page }) => {
		await page.goto('/settings');

		await page.getByLabel('New password').fill('correct-horse-battery');
		await page.getByLabel('Confirm password').fill('correct-horse-batteries');
		await page.getByRole('button', { name: 'Update password' }).click();

		// No HTML constraint can express "these two fields must match", so this
		// is the zod refinement running client-side through zod4Client.
		await expect(page.getByText('Passwords do not match.')).toBeVisible();
		await expect(page.getByText('Password updated')).toBeHidden();
	});

	test('a too-short password never reaches the server', async ({ page }) => {
		await page.goto('/settings');

		await page.getByLabel('New password').fill('short');
		await page.getByLabel('Confirm password').fill('short');
		await page.getByRole('button', { name: 'Update password' }).click();

		// minlength comes from the shared schema's PASSWORD_MIN_LENGTH.
		await expect(page.locator('#password:invalid')).toBeVisible();
		await expect(page.getByText('Password updated')).toBeHidden();
	});
});
