import { expect, test } from '../support/fixtures';
import { guardedRoutes } from '../support/routes';

/**
 * The broad regression pass: every page the app renders, visited signed in.
 *
 * It is deliberately shallow and deliberately automatic — the route list is
 * read from `src/routes`, so a page added under `(app)` is swept from the
 * moment it exists. What it catches is the class of breakage that is easy to
 * ship and easy to miss: a load function that throws, a component that fails
 * to hydrate, a rune misuse that only surfaces in the browser, a deleted
 * asset. Depth belongs in the per-area specs beside this file.
 */
for (const pathname of guardedRoutes()) {
	test(`${pathname} renders for a signed-in visitor`, async ({ page, baseURL }) => {
		// Only the app's own requests: the /components avatar demo pulls an
		// image from github.com, and someone else's outage is not a regression.
		const brokenRequests: string[] = [];
		page.on('response', (response) => {
			const url = response.url();
			if (baseURL && url.startsWith(baseURL) && response.status() >= 400) {
				brokenRequests.push(`${String(response.status())} ${url}`);
			}
		});

		const response = await page.goto(pathname);

		expect(response?.status(), `${pathname} did not return 200`).toBe(200);
		await expect(page).toHaveURL(pathname);
		// Every page names itself, in the tab and on the screen.
		await expect(page).toHaveTitle(/\S/);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		// The shell came with it, so the whole layout chain resolved.
		await expect(page.locator('[data-slot="sidebar"]')).toBeVisible();

		expect(brokenRequests, 'the page requested something that 4xx-ed').toEqual([]);
	});
}

test('an unknown path is a 404, not a redirect, once signed in', async ({ page }) => {
	const response = await page.goto('/no-such-page');

	expect(response?.status()).toBe(404);
	// The root error page, not the `(app)` one: an unmatched path never entered
	// the group. Its title is a Card.Title, which shadcn renders as a div.
	await expect(page.getByText('Page not found')).toBeVisible();
});
