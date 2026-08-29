import { test as base, expect } from '@playwright/test';

/**
 * The house `test`. Import it instead of `test` from `@playwright/test`, so
 * every spec inherits the console guard below.
 */
export interface AppFixtures {
	/**
	 * Errors the page logged, in order. Read it to assert on a specific
	 * message; ignore it and the guard still fails the test when it is
	 * non-empty at teardown.
	 */
	consoleErrors: string[];
}

/**
 * Silence is the assertion nobody writes. A page that renders correctly while
 * throwing in an effect, hydrating twice, or violating the CSP is a regression
 * the visible assertions miss, so every test fails on a console error or an
 * uncaught exception.
 *
 * Failures loading a third-party asset are excluded: the `/components` avatar
 * demo pulls an image from github.com, and someone else's outage is not this
 * app regressing.
 */
export const test = base.extend<AppFixtures>({
	consoleErrors: [
		async ({ page, baseURL }, use) => {
			const errors: string[] = [];

			page.on('console', (message) => {
				if (message.type() !== 'error') return;
				const source = message.location().url;
				if (baseURL && source !== '' && !source.startsWith(baseURL)) return;
				errors.push(message.text());
			});
			page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));

			await use(errors);

			expect(errors, 'the page logged errors to the console').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };
