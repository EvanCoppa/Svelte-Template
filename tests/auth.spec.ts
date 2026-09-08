import { expect, test, type Locator, type Page } from '@playwright/test';
import { NO_STACK_REASON, TEST_USER, authStackReachable } from './env';

/**
 * The signed-in half of the suite. Everything here needs a real Auth server,
 * so each test skips itself when none is reachable:
 *
 *   npm run db:start && npm run db:env && npm run test:e2e
 *
 * The credentials come from supabase/seed.sql, so a freshly reset local stack
 * is already set up for this — see tests/env.ts to point it elsewhere.
 */
test.beforeEach(async () => {
	test.skip(!(await authStackReachable()), NO_STACK_REASON);
});

/**
 * Click something whose behaviour only exists once Svelte has hydrated.
 *
 * Playwright treats a server-rendered button as clickable the moment it is
 * visible, which is well before the client bundle has attached its handlers —
 * especially in dev, and especially right after the login redirect. Such a
 * click lands on inert HTML and is silently dropped. Retrying until the
 * expected effect shows up is the documented remedy, and it keeps these tests
 * about the app's behaviour rather than about load timing.
 */
async function clickWhenLive(target: Locator, expected: () => Promise<void>) {
	await expect(async () => {
		await target.click();
		await expected();
	}).toPass({ timeout: 20_000 });
}

async function signIn(page: Page, { next }: { next?: string } = {}) {
	await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
	await page.getByLabel('Email').fill(TEST_USER.email);
	await page.getByLabel('Password').fill(TEST_USER.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('signing in', () => {
	test('lands on the dashboard as the seeded user', async ({ page }) => {
		await signIn(page);

		await expect(page).toHaveURL('/');
		// Titles come from the `pages` table, resolved by the (app) layout — the
		// dashboard is a shell page, belonging to no feature.
		await expect(page).toHaveTitle('Dashboard');
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
		// Rendered in the page body and again in the sidebar's user menu.
		await expect(page.getByText(TEST_USER.email).first()).toBeVisible();
	});

	test('rejects a wrong password with a non-committal message', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill(TEST_USER.email);
		await page.getByLabel('Password').fill('not-the-right-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		// A real account with a wrong password must produce exactly the same
		// message as an address with no account, or login becomes an
		// enumeration oracle.
		await expect(page.getByText('Invalid email or password.')).toBeVisible();
		await expect(page).toHaveURL(/\/login/);
	});

	test('keeps the session across a full page reload', async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');

		await page.reload();

		// A reload is served by the server, so this proves the auth cookies
		// survive the round trip rather than living only in client memory.
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	});

	test('returns to the page that triggered the login', async ({ page }) => {
		await signIn(page, { next: '/settings/profile' });

		await expect(page).toHaveURL('/settings/profile');
	});

	test('refuses to follow ?next= off-site', async ({ page }) => {
		// `//evil.example.com` is protocol-relative: a browser treats it as an
		// absolute URL. The action must fall back to '/' instead.
		await signIn(page, { next: '//evil.example.com' });

		// toHaveURL resolves against baseURL, so this also asserts the origin.
		await expect(page).toHaveURL('/');
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	});
});

test.describe('the app shell', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');
	});

	test('names the pages walked through in the header breadcrumb trail', async ({ page }) => {
		// The walk taken, not a hierarchy: the crumbs are named from the
		// `pages` registry and kept in this tab's sessionStorage, so they
		// survive the full page load below.
		await page.goto('/companies');

		const trail = page.getByRole('navigation', { name: 'breadcrumb' });
		await expect(trail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
		await expect(trail.getByRole('link', { name: 'Companies' })).toBeVisible();

		// And the way back is a plain link, so it works before hydration.
		await trail.getByRole('link', { name: 'Dashboard' }).click();
		await expect(page).toHaveURL('/');
	});

	test('restarts the trail where the shell jumps, and follows a link deeper', async ({ page }) => {
		// `Breadcrumb.Page` is a span carrying role="link" too, so the crumbs
		// are told apart by slot: a link is a page walked through, the page
		// slot is where the reader is now.
		const trail = page.getByRole('navigation', { name: 'breadcrumb' });
		const walked = trail.locator('[data-slot="breadcrumb-link"]');
		const here = trail.locator('[data-slot="breadcrumb-page"]');

		// Signed in on the dashboard: one page, nothing walked to reach it.
		await expect(here).toHaveText('Dashboard');
		await expect(walked).toHaveCount(0);

		// A link inside the page is a step deeper, which is the depth the
		// trail exists to show.
		await clickWhenLive(page.getByRole('link', { name: 'Browse components' }), () =>
			expect(page).toHaveURL('/components')
		);
		await expect(walked).toHaveText(['Dashboard']);
		await expect(here).toHaveText('Components');

		// The sidebar jumps: nothing was walked to get here whatever was on
		// screen before, so there is no way back to offer.
		await clickWhenLive(page.getByRole('button', { name: 'Companies' }).first(), () =>
			expect(page).toHaveURL('/companies')
		);
		await expect(here).toHaveText('Companies');
		await expect(walked).toHaveCount(0);
	});

	test('starts a fresh trail from the settings sidebar too', async ({ page }) => {
		const trail = page.getByRole('navigation', { name: 'breadcrumb' });
		const walked = trail.locator('[data-slot="breadcrumb-link"]');

		// A full load into the settings shell, two crumbs deep...
		await page.goto('/settings');
		await expect(page).toHaveURL('/settings/profile');
		await expect(walked).toHaveText(['Dashboard']);

		// ...and its sections are a nav like any other: siblings, not steps.
		await clickWhenLive(page.getByRole('button', { name: 'Security' }), () =>
			expect(page).toHaveURL('/settings/security')
		);
		await expect(trail.locator('[data-slot="breadcrumb-page"]')).toHaveText('Security');
		await expect(walked).toHaveCount(0);
	});

	test('renders every navigation entry the session may see', async ({ page }) => {
		// The static pages plus the features resolved for the active org and
		// readable by the user (seed.sql: e2e is an Acme member holding the
		// crm 'Support' role, which grants staff, companies, contacts, tickets
		// and the library pages at read). Tasks is switched off by the org,
		// and Deals and Products carry no grant for Support, so none of the
		// three may appear. Settings is not here either: it is a shell of its
		// own, entered from the user menu (see $lib/navigation).
		for (const label of [
			'Dashboard',
			'Companies',
			'Contacts',
			'Tickets',
			'Staff',
			'Components',
			'Best Practices'
		]) {
			await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
		}
		await expect(page.getByRole('button', { name: 'Tasks' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Deals' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Products' })).toHaveCount(0);
	});

	test('marks a feature outside the plan as locked and opens the upgrade prompt', async ({
		page
	}) => {
		// Best Practices is enterprise-only; Acme is on Pro -> locked_visible.
		const entry = page.getByRole('button', { name: /Best Practices/ }).first();
		await expect(entry.locator('..').locator('[data-slot="sidebar-menu-badge"]')).toBeVisible();

		// No navigation: the pitch opens in place.
		await clickWhenLive(entry, () => expect(page.getByRole('dialog')).toBeVisible());
		await expect(
			page.getByRole('dialog').getByText(/Best Practices isn't included in the Pro plan/)
		).toBeVisible();
		await expect(page).not.toHaveURL(/upgrade/);
	});

	test('navigates when a sidebar entry is clicked', async ({ page }) => {
		// Sidebar entries are Sidebar.MenuButton (a <button> calling goto), not
		// anchors — see src/lib/components/app-sidebar.svelte.
		await clickWhenLive(page.getByRole('button', { name: 'Components' }).first(), () =>
			expect(page).toHaveURL('/components')
		);
	});

	test('opens the palette from the sidebar and navigates', async ({ page }) => {
		// The search button lives in the sidebar header, above the nav it jumps
		// to — the top bar carries no search of its own.
		await clickWhenLive(
			page.locator('[data-slot="sidebar-header"]').getByRole('button', { name: 'Search' }),
			() => expect(page.getByRole('dialog')).toBeVisible()
		);

		const palette = page.getByRole('dialog');
		// Entries are scored against their `value` — the label plus its aliases
		// (see search-dialog.svelte), not the prose on the page they open.
		await palette.getByRole('combobox').fill('compon');
		await palette
			.getByRole('option', { name: /components/i })
			.first()
			.click();

		await expect(page).toHaveURL('/components');
	});

	test('opens the palette with the keyboard shortcut', async ({ page }) => {
		await expect(async () => {
			await page.keyboard.press('ControlOrMeta+k');
			await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 20_000 });

		await expect(page.getByRole('combobox')).toBeVisible();
	});

	test('bounces a locked feature route to the dashboard and opens the upgrade prompt', async ({
		page
	}) => {
		// Gated in hooks.server.ts before any load runs — typing the URL is no
		// way around a missing plan. The prompt then takes `?upgrade=` off the URL.
		await page.goto('/best-practices');
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(
			page.getByRole('dialog').getByText(/Best Practices isn't included in the Pro plan/)
		).toBeVisible();
		await expect(page).toHaveURL('/');
	});

	test('sends a feature the org switched off to the feature settings', async ({ page }) => {
		// seed.sql: Acme turned Tasks off. A member sees why, read-only.
		await page.goto('/tasks');
		await expect(page).toHaveURL('/settings/features?feature=tasks');
		await expect(page.getByText(/Tasks is turned off for this organization/)).toBeVisible();
		await expect(page.locator('[data-slot="switch"]').first()).toBeDisabled();
	});

	test('answers 403 for a feature the user holds no grant on', async ({ page }) => {
		// Deals is enabled for Acme (Pro), but the Support role grants nothing
		// on it. The gate refuses before the route exists as far as the client
		// can tell.
		const response = await page.goto('/deals');
		expect(response?.status()).toBe(403);
	});

	test('lists a readable feature page with its seeded rows', async ({ page }) => {
		await page.goto('/companies');
		await expect(page).toHaveTitle('Companies');
		await expect(page.getByRole('cell', { name: 'Wayne Enterprises' })).toBeVisible();
	});

	test('lists a person who belongs to no company at all', async ({ page }) => {
		// The party model's whole point: a customer who is a person, with an
		// em dash where a company would be rather than an invented one.
		await page.goto('/contacts');
		await expect(page).toHaveTitle('Contacts');
		await expect(page.getByRole('cell', { name: 'Bruce Wayne' })).toBeVisible();
	});

	test('opens settings on its first section, in its own sidebar', async ({ page }) => {
		// /settings is the door: it redirects to the first entry in
		// `settingsNav`, and the shell swaps the app nav for the settings one.
		await page.goto('/settings');

		await expect(page).toHaveURL('/settings/profile');
		await expect(page).toHaveTitle('Profile');
		await expect(page.getByRole('button', { name: 'Back to app' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Security' })).toBeVisible();
		// Loaded through RLS, so this row can only be the caller's own. Matches
		// the page body and the sidebar user menu, hence first().
		await expect(page.getByText(TEST_USER.email).first()).toBeVisible();
	});

	test('keeps Settings out of the app sidebar', async ({ page }) => {
		await page.goto('/');

		// It is reached from the user menu in the sidebar footer instead — the
		// nav lists the places you work, not the place you configure them.
		await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
	});
});

test.describe('the staff page', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');
		await page.goto('/staff');
	});

	test('lists the members of the active organization', async ({ page }) => {
		// seed.sql: Acme Inc holds Dev User (owner), Evan Coppa (admin) and the
		// E2E robot (member). The roster reads them through the shared-org
		// profiles policy from the staff_management migration — without it the
		// caller would only ever see their own row.
		await expect(page).toHaveTitle('Staff');
		await expect(page.getByText('Dev User').first()).toBeVisible();
		await expect(page.getByText('Evan Coppa').first()).toBeVisible();
	});

	test('offers no invite or removal controls to a read-only member', async ({ page }) => {
		// The seeded 'Support' role grants staff at read, so the page renders
		// but every managing affordance stays absent — including the row menu,
		// whose column drops out entirely. RLS enforces the same thing
		// independently; this asserts the screen agrees with it.
		await expect(page.getByText('Dev User').first()).toBeVisible();
		await expect(page.getByRole('button', { name: /invite/i })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /remove/i })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
	});

	test('filters the roster from the search box', async ({ page }) => {
		// Filtering happens in the browser, so it only answers once Svelte has
		// hydrated — the same hazard clickWhenLive() exists for, retried the
		// same way rather than waited out.
		const search = page.getByLabel('Search staff');
		await expect(async () => {
			await search.fill('evan');
			await expect(page.getByText('Dev User')).toHaveCount(0);
		}).toPass({ timeout: 20_000 });

		await expect(page.getByText('Evan Coppa')).toBeVisible();
	});

	test('summarises the same roster beside it', async ({ page }) => {
		// seed.sql: Acme holds three people, two of them owner/admin. The panel
		// is located by a row it always carries — Card.Title renders a <div>, so
		// there is no heading role, and this card is titled with the org name.
		const summary = page.locator('[data-slot="card"]', {
			has: page.getByText('Total members')
		});
		await expect(summary.getByText('Acme Inc')).toBeVisible();
		await expect(summary.getByText('3', { exact: true })).toBeVisible();
		await expect(summary.getByText('Owners & admins')).toBeVisible();
	});
});

test.describe('the workspace switcher', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');
	});

	// The switcher lives in the sidebar header; scoping there keeps org names
	// from colliding with the same text elsewhere on the page (strict mode).
	const switcher = (page: Page) => page.locator('[data-slot="sidebar-header"]');

	test('shows the active workspace on one line, without its tier', async ({ page }) => {
		// seed.sql: e2e@example.com is a member of "Acme Inc" (pro) plus their
		// personal org; "Acme Inc" sorts first, so it is the default active org.
		await expect(switcher(page).getByText('Acme Inc')).toBeVisible();
		// The tier moved out of the switcher — the row is logo, name, chevron.
		await expect(switcher(page).getByText('Pro')).toHaveCount(0);
	});

	test('switches workspaces and persists the choice across reloads', async ({ page }) => {
		// Open → select → verify as ONE retryable unit. Splitting it (clickWhenLive
		// to open, then a separate item click) has a parity hazard: the opener's
		// final retry can toggle the menu closed while the exit animation still
		// reports the item visible, and the follow-up click then selects nothing.
		const label = switcher(page).getByText('E2E Robot');
		const item = page.getByRole('menuitem', { name: 'E2E Robot' });
		await expect(async () => {
			if (await label.isVisible()) return; // a previous attempt already switched
			if (!(await item.isVisible())) {
				await switcher(page).getByRole('button', { name: 'Acme Inc' }).click({ timeout: 2000 });
			}
			await item.click({ timeout: 2000 });
			// PUT /api/org + invalidate; the first hit also compiles the endpoint.
			await expect(label).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 30_000 });

		// A reload is served fresh from the server, so this proves the active
		// org lives in the cookie, not just in client memory.
		await page.reload();
		await expect(switcher(page).getByText('E2E Robot')).toBeVisible();
	});

	test('does not list organizations the user is not a member of', async ({ page }) => {
		await clickWhenLive(switcher(page).getByRole('button', { name: 'Acme Inc' }), () =>
			expect(page.getByRole('menuitem', { name: 'E2E Robot' })).toBeVisible()
		);

		// seed.sql keeps e2e@example.com out of Globex on purpose: RLS must hide
		// it entirely, so the tenant boundary shows up as an absent menu item.
		await expect(page.getByRole('menuitem', { name: 'Acme Inc' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Globex' })).toHaveCount(0);
	});
});

test.describe('signing out', () => {
	test('ends the session and re-arms the guard', async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');

		await clickWhenLive(page.getByRole('button', { name: 'Log out' }).first(), () =>
			expect(page).toHaveURL(/\/login/)
		);

		// The cookies are actually gone, not just the client state.
		await page.goto('/settings');
		await expect(page).toHaveURL('/login?next=%2Fsettings');
	});
});
