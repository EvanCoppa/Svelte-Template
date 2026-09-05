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
		await signIn(page, { next: '/settings' });

		await expect(page).toHaveURL('/settings');
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

	test('renders every navigation entry the session may see', async ({ page }) => {
		// The static pages plus the features resolved for the active org and
		// readable by the user (seed.sql: e2e is an Acme member holding the
		// crm 'Support' role, which grants staff, clients, tickets and the
		// library pages at read). Tasks is switched off by the org and Deals
		// carries no grant for Support, so neither may appear.
		for (const label of [
			'Dashboard',
			'Clients',
			'Tickets',
			'Staff',
			'Settings',
			'Components',
			'Best Practices'
		]) {
			await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
		}
		await expect(page.getByRole('button', { name: 'Tasks' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Deals' })).toHaveCount(0);
	});

	test('marks a feature outside the plan as locked and sends it to the upgrade page', async ({
		page
	}) => {
		// Best Practices is enterprise-only; Acme is on Pro -> locked_visible.
		const entry = page.getByRole('button', { name: /Best Practices/ }).first();
		await expect(entry.locator('..').locator('[data-slot="sidebar-menu-badge"]')).toBeVisible();

		await clickWhenLive(entry, () => expect(page).toHaveURL('/upgrade?feature=best-practices'));
		await expect(page).toHaveTitle('Upgrade');
		await expect(page.getByText(/Best Practices isn't included in the Pro plan/)).toBeVisible();
	});

	test('navigates when a sidebar entry is clicked', async ({ page }) => {
		// Sidebar entries are Sidebar.MenuButton (a <button> calling goto), not
		// anchors — see src/lib/components/app-sidebar.svelte.
		await clickWhenLive(page.getByRole('button', { name: 'Components' }).first(), () =>
			expect(page).toHaveURL('/components')
		);
	});

	test('opens the palette from the header and navigates', async ({ page }) => {
		await clickWhenLive(page.locator('.search-bar'), () =>
			expect(page.getByRole('dialog')).toBeVisible()
		);

		const palette = page.getByRole('dialog');
		await palette.getByRole('combobox').fill('shadcn');
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

	test('bounces a locked feature route to the upgrade page', async ({ page }) => {
		// Gated in hooks.server.ts before any load runs — typing the URL is no
		// way around a missing plan.
		await page.goto('/best-practices');
		await expect(page).toHaveURL('/upgrade?feature=best-practices');
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
		await page.goto('/clients');
		await expect(page).toHaveTitle('Clients');
		await expect(page.getByRole('cell', { name: 'Wayne Enterprises' })).toBeVisible();
	});

	test('shows the signed-in user their profile on /settings', async ({ page }) => {
		await page.goto('/settings');

		// Loaded through RLS, so this row can only be the caller's own. Matches
		// the page body and the sidebar user menu, hence first().
		await expect(page.getByText(TEST_USER.email).first()).toBeVisible();
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

	test('shows the active workspace and its tier', async ({ page }) => {
		// seed.sql: e2e@example.com is a member of "Acme Inc" (pro) plus their
		// personal org; "Acme Inc" sorts first, so it is the default active org.
		await expect(switcher(page).getByText('Acme Inc')).toBeVisible();
		await expect(switcher(page).getByText('Pro')).toBeVisible();
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
