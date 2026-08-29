import { expect, test } from '../support/fixtures';
import { guardedRoutes } from '../support/routes';

/**
 * Pixel baselines for every page, one screenshot each.
 *
 * Opt-in: `playwright.config.ts` only declares this project once
 * `e2e/visual/__screenshots__/` exists, so a fresh clone and a first CI run
 * are green without it. Baselines are platform-specific — generate them the
 * way CI does or every diff is a font-rendering artefact. See
 * docs/e2e-testing.md.
 */
for (const pathname of guardedRoutes()) {
	test(`${pathname} looks unchanged`, async ({ page }) => {
		await page.goto(pathname);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		const name = `${pathname === '/' ? 'dashboard' : pathname.replace(/\//gu, '-').slice(1)}.png`;
		await expect(page).toHaveScreenshot(name, {
			fullPage: true,
			animations: 'disabled',
			// Antialiasing differs by a pixel or two between runs; a real visual
			// regression is never this small.
			maxDiffPixelRatio: 0.01
		});
	});
}
