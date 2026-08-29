import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { TEST_USER } from './env';

export interface ConsoleGuard {
	/**
	 * Declare an error this test provokes on purpose — a sign-in with the wrong
	 * password is a 400 from Supabase, a 404 spec asks for a page that is not
	 * there. This is the only sanctioned exception: an error the app logged by
	 * accident is a bug to fix, never a pattern to add here.
	 */
	allow(pattern: RegExp): void;
}

export interface AppFixtures {
	consoleGuard: ConsoleGuard;
}

/**
 * The house `test`. Import it here rather than from `@playwright/test`, or the
 * spec silently loses the console guard.
 *
 * Silence is the assertion nobody writes: every test fails if the page logged
 * an error or threw. A page that renders correctly while throwing in an
 * effect, hydrating twice, violating the CSP or carrying an attribute the
 * browser rejects is a regression every visible assertion misses. It is what
 * caught the invalid `pattern` on /login's email input.
 *
 * Failures loading a *third-party* asset are ignored: the /components avatar
 * demo pulls an image from github.com, and someone else's outage is not this
 * app regressing. Everything from the app's own origin counts.
 */
export const test = base.extend<AppFixtures>({
	consoleGuard: [
		async ({ page, baseURL }, use) => {
			const errors: string[] = [];
			const allowed: RegExp[] = [];

			page.on('console', (message) => {
				if (message.type() !== 'error') return;
				const source = message.location().url;
				if (baseURL && source !== '' && !source.startsWith(baseURL)) return;
				errors.push(message.text());
			});
			page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));

			await use({
				allow(pattern) {
					allowed.push(pattern);
				}
			});

			const unexpected = errors.filter((text) => !allowed.some((pattern) => pattern.test(text)));
			expect(unexpected, 'the page logged errors to the console').toEqual([]);
		},
		{ auto: true }
	]
});

/**
 * Click something whose behaviour only exists once Svelte has hydrated.
 *
 * Playwright treats a server-rendered button as clickable the moment it is
 * visible, which is well before the client bundle has attached its handlers —
 * especially in dev, and especially right after the login redirect. Such a
 * click lands on inert HTML and is silently dropped (or submits the form the
 * old-fashioned way). Retrying until the expected effect shows up is the
 * documented remedy, and it keeps these tests about the app's behaviour
 * rather than about load timing.
 */
export async function clickWhenLive(target: Locator, expected: () => Promise<void>) {
	await expect(async () => {
		await target.click();
		await expected();
	}).toPass({ timeout: 20_000 });
}

/**
 * Fill and submit a form, retrying the whole sequence until it takes.
 *
 * `clickWhenLive`'s problem with a twist: a click that lands before hydration
 * submits the form the old-fashioned way, which navigates and clears the
 * inputs — so a retry that only re-clicks submits an empty form. Anything
 * whose *values* matter has to re-fill inside the retry, which is what this
 * does.
 */
export async function submitWhenLive(steps: () => Promise<void>, expected: () => Promise<void>) {
	await expect(async () => {
		await steps();
		await expected();
	}).toPass({ timeout: 20_000 });
}

/** Sign in as the seeded user, optionally through a `?next=` destination. */
export async function signIn(page: Page, { next }: { next?: string } = {}) {
	await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
	await page.getByLabel('Email').fill(TEST_USER.email);
	await page.getByLabel('Password').fill(TEST_USER.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

export { expect };
