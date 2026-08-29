import { NO_STACK_REASON, TEST_USER, authStackReachable } from './env';
import { clickWhenLive, expect, signIn, submitWhenLive, test } from './fixtures';
import { guardedRoutes } from './routes';

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

test.describe('signing in', () => {
	test('lands on the dashboard as the seeded user', async ({ page }) => {
		await signIn(page);

		await expect(page).toHaveURL('/');
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
		// Rendered in the page body and again in the sidebar's user menu.
		await expect(page.getByText(TEST_USER.email).first()).toBeVisible();
	});

	test('rejects a wrong password with a non-committal message', async ({ page, consoleGuard }) => {
		// The rejected sign-in is a 400 from the Auth server, on purpose.
		consoleGuard.allow(/400 \(Bad Request\)/);

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

/**
 * The broad pass: every page the app renders, signed in. Deliberately shallow
 * and deliberately automatic — the route list is read from src/routes, so a
 * page added under `(app)` is covered the moment it exists. What it catches is
 * the breakage that is easy to ship and easy to miss: a load function that
 * throws, a component that fails to hydrate, a rune misuse that only surfaces
 * in the browser, a deleted asset. Depth belongs in the describes below.
 */
test.describe('every page renders', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');
	});

	for (const pathname of guardedRoutes()) {
		test(pathname, async ({ page, baseURL }) => {
			const broken: string[] = [];
			page.on('response', (response) => {
				const url = response.url();
				// Same-origin only — the /components avatar demo pulls an image
				// from github.com — and never the dev server's own plumbing.
				if (!baseURL || !url.startsWith(baseURL)) return;
				if (url.includes('/@vite/') || url.includes('/@fs/') || url.includes('/.vite/')) return;
				if (response.status() >= 400) broken.push(`${String(response.status())} ${url}`);
			});

			const response = await page.goto(pathname);

			expect(response?.status(), `${pathname} did not return 200`).toBe(200);
			await expect(page).toHaveURL(pathname);
			// Every page names itself, in the tab and on the screen.
			await expect(page).toHaveTitle(/\S/);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			// The shell came with it, so the whole layout chain resolved.
			await expect(page.locator('[data-slot="sidebar"]')).toBeVisible();

			expect(broken, 'the page requested something that 4xx-ed').toEqual([]);
		});
	}

	test('an unknown path is a 404, not a redirect', async ({ page, consoleGuard }) => {
		// The whole point of the test is a document that is not there.
		consoleGuard.allow(/404 \(Not Found\)/);

		const response = await page.goto('/no-such-page');

		expect(response?.status()).toBe(404);
		// The root error page, not the `(app)` one: an unmatched path never
		// entered the group. Its title is a Card.Title, so a div, not a heading.
		await expect(page.getByText('Page not found')).toBeVisible();
	});
});

test.describe('the app shell', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');
	});

	test('renders every navigation entry in the sidebar', async ({ page }) => {
		// navItems drives both the sidebar and the palette, so this is really a
		// check that src/lib/navigation.ts reached the shell.
		for (const label of ['Dashboard', 'Settings', 'Components', 'Best Practices']) {
			await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
		}
	});

	test('offers the same pages in the sidebar and the palette', async ({ page }) => {
		// Scoped to the nav section: the header's team switcher and the footer's
		// user menu are sidebar menu buttons too, and neither is a page.
		// Sidebar.MenuButton renders through a child snippet here, so the button
		// itself carries no data-slot — the menu item around it does.
		const navItems = page.locator('[data-slot="sidebar-content"] [data-slot="sidebar-menu-item"]');
		// allInnerTexts() does not auto-wait; settle on something that does.
		await expect(navItems.first()).toBeVisible();
		const sidebarLabels = await navItems.allInnerTexts();

		await clickWhenLive(page.locator('.search-bar'), () =>
			expect(page.getByRole('dialog')).toBeVisible()
		);
		// Same for the palette: cmdk builds its list after the dialog opens, so
		// settle on the count, which auto-waits.
		const options = page.getByRole('dialog').getByRole('option');
		await expect(options).toHaveCount(sidebarLabels.length);
		const paletteLabels = await options.allInnerTexts();

		const tidy = (labels: string[]) => labels.map((label) => label.trim()).sort();
		expect(tidy(paletteLabels)).toEqual(tidy(sidebarLabels));
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
		await palette.getByRole('combobox').fill('best');
		await palette
			.getByRole('option', { name: /best practices/i })
			.first()
			.click();

		await expect(page).toHaveURL('/best-practices');
	});

	test('finds a page by an alias that is not its label', async ({ page }) => {
		await clickWhenLive(page.locator('.search-bar'), () =>
			expect(page.getByRole('dialog')).toBeVisible()
		);

		// "kitchen sink" is an alias on the Components entry in navigation.ts;
		// if aliases stop reaching the palette, only this notices.
		const palette = page.getByRole('dialog');
		await palette.getByRole('combobox').fill('kitchen sink');

		await expect(palette.getByRole('option', { name: /components/i })).toBeVisible();
	});

	test('opens the palette with the keyboard shortcut', async ({ page }) => {
		await expect(async () => {
			await page.keyboard.press('ControlOrMeta+k');
			await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 20_000 });

		await expect(page.getByRole('combobox')).toBeVisible();
	});

	test('remembers the theme across a reload', async ({ page }) => {
		const html = page.locator('html');
		const wasDark = await html.evaluate((element) => element.classList.contains('dark'));

		await clickWhenLive(page.getByRole('button', { name: 'Toggle theme' }), async () => {
			await expect
				.poll(() => html.evaluate((element) => element.classList.contains('dark')))
				.toBe(!wasDark);
		});

		// The choice is stored, so a reload must not flash back to the old one.
		await page.reload();
		await expect
			.poll(() => html.evaluate((element) => element.classList.contains('dark')))
			.toBe(!wasDark);
	});
});

/**
 * /settings in detail — the template's reference page for the two mutation
 * patterns: a form action writing a typed, RLS-protected row, and one calling
 * Supabase Auth.
 *
 * Note where validation surfaces, because it is not one place. superforms
 * turns the zod schema into HTML constraints on the inputs, and the browser
 * enforces those itself: `maxlength` caps a field while it is being typed, so
 * an over-long value cannot be entered at all.
 *
 * `minlength` is the awkward one and is deliberately *not* tested through the
 * browser here. Whether it fires depends on the element's "modified by user"
 * flag, which Svelte clears whenever `bind:value` re-assigns the same
 * value — so after hydration the browser lets a short password through and
 * superforms answers, while before it the browser blocks the submit silently.
 * A test that asserts either outcome passes alone and fails under load. What
 * is stable is that the constraint reached the input; the rule itself belongs
 * to vitest, which owns the schema.
 *
 * A cross-field refinement has no HTML equivalent at all, so superforms always
 * answers that one — hence the message assertion below.
 */
test.describe('settings', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await expect(page).toHaveURL('/');
		await page.goto('/settings');
	});

	test('shows the signed-in user their profile', async ({ page }) => {
		// Loaded through RLS, so this row can only be the caller's own. Matches
		// the page body and the sidebar user menu, hence first().
		await expect(page.getByText(TEST_USER.email).first()).toBeVisible();
	});

	test('saves the profile, toasts, and survives a reload', async ({ page }) => {
		// Writes to the seeded user's row. That is fine: this only runs against
		// the local stack, which `npm run db:reset` restores.
		const displayName = `E2E ${String(Date.now())}`;

		await submitWhenLive(
			async () => {
				await page.getByLabel('Display name').fill(displayName);
				await page.getByRole('button', { name: 'Save profile' }).click();
			},
			// House convention: successes toast, they do not render a banner.
			() => expect(page.getByText('Profile updated')).toBeVisible({ timeout: 2000 })
		);

		await page.reload();
		await expect(page.getByLabel('Display name')).toHaveValue(displayName);
	});

	test('caps the display name at the length the schema allows', async ({ page }) => {
		const field = page.getByLabel('Display name');
		await field.fill('x'.repeat(101));

		// superforms turns the schema's `.max(100)` into maxlength, and the
		// browser enforces that while typing — so an over-long name cannot be
		// entered at all, let alone submitted.
		await expect(field).toHaveAttribute('maxlength', '100');
		await expect(field).toHaveValue('x'.repeat(100));
	});

	// The password form is exercised only through its failure paths on purpose:
	// actually changing the password would break every later run against the
	// same stack. src/routes/reset-password/page.server.test.ts covers a
	// successful change.
	test('catches a mismatched password confirmation inline', async ({ page, consoleGuard }) => {
		// Before hydration the form posts the old-fashioned way and the server
		// answers fail(400) — progressive enhancement working, not a regression.
		// After it, zod4Client stops the submit and no request goes out. Both
		// end with the same message, which is the point.
		consoleGuard.allow(/400 \(Bad Request\)/);

		await submitWhenLive(
			async () => {
				await page.getByLabel('New password').fill('correct-horse-battery');
				await page.getByLabel('Confirm password').fill('correct-horse-batteries');
				await page.getByRole('button', { name: 'Update password' }).click();
			},
			// No HTML constraint can express "these two must match", so once
			// hydrated this is the zod refinement running through zod4Client.
			() => expect(page.getByText('Passwords do not match.')).toBeVisible({ timeout: 2000 })
		);
	});

	test('carries the shared password rules onto the input', async ({ page }) => {
		const field = page.getByLabel('New password');

		// PASSWORD_MIN_LENGTH from $lib/schemas/password, via superforms. If the
		// constraint stops reaching the DOM, the only thing left enforcing the
		// rule is the server — which is a regression worth a failing test even
		// though the app still rejects the password.
		await expect(field).toHaveAttribute('minlength', '8');
		await expect(field).toHaveAttribute('required', '');
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
