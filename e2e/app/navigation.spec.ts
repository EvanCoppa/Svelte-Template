import { expect, test } from '../support/fixtures';

/**
 * The app shell in detail: the two ways to move between pages, the theme
 * toggle, and signing out. `src/lib/navigation.ts` drives the sidebar and the
 * palette from one list, so these specs are what prove the two stay in step.
 */
test.describe('app shell', () => {
	test('the sidebar navigates and marks where you are', async ({ page }) => {
		await page.goto('/');

		const sidebar = page.locator('[data-slot="sidebar"]');
		await sidebar.getByRole('button', { name: 'Settings' }).click();

		await expect(page).toHaveURL('/settings');
		await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
		await expect(sidebar.getByRole('button', { name: 'Settings' })).toHaveClass(/nav-active/);
	});

	test('the sidebar offers every page in the palette, and vice versa', async ({ page }) => {
		await page.goto('/');

		// Scoped to the nav section: the header's team switcher and the footer's
		// user menu are sidebar menu buttons too, and neither is a page.
		const sidebarLabels = await page
			.locator('[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"]')
			.allInnerTexts();

		await page.keyboard.press('ControlOrMeta+k');
		const palette = page.getByRole('dialog', { name: 'Search' });
		await expect(palette).toBeVisible();
		const paletteLabels = await palette.getByRole('link').allInnerTexts();

		const normalise = (labels: string[]) => labels.map((label) => label.trim()).sort();
		expect(normalise(paletteLabels)).toEqual(normalise(sidebarLabels));
	});

	test('the command palette opens on the keyboard, filters, and navigates', async ({ page }) => {
		await page.goto('/');

		await page.keyboard.press('ControlOrMeta+k');
		const palette = page.getByRole('dialog', { name: 'Search' });
		await expect(palette).toBeVisible();

		// "kitchen sink" is an alias, not the label — the palette searches both.
		await palette.getByPlaceholder('Type to search...').fill('kitchen sink');
		await expect(palette.getByRole('link', { name: 'Components' })).toBeVisible();

		await page.keyboard.press('Enter');

		await expect(page).toHaveURL('/components');
		await expect(palette).toBeHidden();
	});

	test('the theme toggle flips the document and survives a reload', async ({ page }) => {
		await page.goto('/');

		const html = page.locator('html');
		const wasDark = await html.evaluate((element) => element.classList.contains('dark'));

		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await expect
			.poll(() => html.evaluate((element) => element.classList.contains('dark')))
			.toBe(!wasDark);

		// The choice is stored, so a reload must not flash back to the old theme.
		await page.reload();
		await expect
			.poll(() => html.evaluate((element) => element.classList.contains('dark')))
			.toBe(!wasDark);
	});

	test('signing out ends the session, not just the page', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Log out' }).click();
		await expect(page).toHaveURL('/login');

		// The real assertion: the cookie is gone, so the guard bounces us again.
		await page.goto('/settings');
		await expect(page).toHaveURL(`/login?next=${encodeURIComponent('/settings')}`);
	});
});
