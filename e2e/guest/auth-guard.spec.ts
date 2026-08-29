import { expect, test } from '../support/fixtures';
import { guardedRoutes, publicRoutes } from '../support/routes';

/**
 * The default-deny contract from `src/hooks.server.ts`, exercised through a
 * real browser against the production build. `src/routes/login/page.server.test.ts`
 * and friends unit-test the same guard; this proves it survives the build,
 * the adapter and the redirect chain.
 *
 * The route list comes from the filesystem, so a new page under `(app)` is
 * covered here the moment it exists.
 */
test.describe('signed out', () => {
	for (const pathname of guardedRoutes()) {
		test(`${pathname} bounces to the login page`, async ({ page }) => {
			await page.goto(pathname);

			await expect(page).toHaveURL(`/login?next=${encodeURIComponent(pathname)}`);
			await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
		});
	}

	for (const pathname of publicRoutes()) {
		test(`${pathname} renders without a session`, async ({ page }) => {
			const response = await page.goto(pathname);

			expect(response?.status()).toBe(200);
			await expect(page).toHaveURL(pathname);
		});
	}

	test('an unknown path is protected too, not 404-ed to anonymous callers', async ({ page }) => {
		await page.goto('/no-such-page');

		await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/no-such-page')}`);
	});

	test('the query string survives the bounce, so the next param is complete', async ({ page }) => {
		await page.goto('/settings?tab=profile');

		await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/settings?tab=profile')}`);
		await expect(page.locator('input[name="next"]')).toHaveValue('/settings?tab=profile');
	});

	test('the reset form says the link expired instead of asking for a next', async ({ page }) => {
		// A browser reaching /reset-password with no session means the recovery
		// link never took; bouncing to /login?next= would ask for something the
		// visitor has no way to satisfy.
		await page.goto('/reset-password');

		await expect(page).toHaveURL('/login?error=recovery_link_invalid');
		await expect(page.getByRole('alert')).toContainText('password reset link is invalid');
	});
});
