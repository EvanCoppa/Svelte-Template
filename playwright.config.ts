import { defineConfig, devices } from '@playwright/test';
import { SUPABASE_KEY, SUPABASE_URL } from './tests/env';

const PORT = 5173;

/**
 * Where the run points. Unset — the normal case — means Playwright starts the
 * dev server below. Set `E2E_BASE_URL` to a deployed URL and the same specs
 * run against it with nothing started locally, which is what
 * .github/workflows/e2e-deployment.yml does on every successful deployment.
 * The signed-in specs still skip themselves there unless a stack is reachable.
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${String(PORT)}`;

/**
 * End-to-end tests. Unit tests (vitest) live next to the code in `src/`; these
 * drive a real browser against a real dev server, so they live in `tests/`.
 *
 * `npm run test:e2e` works on a fresh clone with no configuration: the specs
 * that only exercise the route guard never reach Supabase. The specs that sign
 * in skip themselves until a stack is reachable — see tests/env.ts.
 */
export default defineConfig({
	testDir: './tests',
	// Everything else in `tests/` is a helper, not a spec.
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	// A stray `test.only` should fail the build, not silently shrink the run.
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

	use: {
		baseURL,
		trace: 'on-first-retry'
	},

	// One browser on purpose. Add firefox/webkit here if the project needs
	// them; the auth surface behaves identically across engines.
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: `npm run dev -- --port ${String(PORT)} --strictPort`,
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				// Cold start compiles the whole app.
				timeout: 120_000,
				env: {
					// Resolved the same way tests/env.ts resolves them, so the server and
					// the assertions never disagree about which project is in play.
					PUBLIC_SUPABASE_URL: SUPABASE_URL,
					PUBLIC_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
					// Critical: auto-login would sign the browser in before it ever
					// reaches /login, quietly turning every route-guard assertion green
					// for the wrong reason. A developer with it set in .env still gets a
					// meaningful E2E run.
					DEV_AUTO_LOGIN: 'false'
				}
			}
});
