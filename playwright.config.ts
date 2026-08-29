import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE, e2eCredentials } from './e2e/support/session';

/**
 * Playwright runs in plain Node, so nothing here can reach for SvelteKit's
 * `$env` modules. Load `.env` the way vite would instead, so a local run picks
 * up the same Supabase project `npm run dev` uses. CI has no `.env` file — it
 * passes the same variables through the job environment.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * Where the suite points. Unset (the normal case) means Playwright builds the
 * app and serves the build with `vite preview`. Set `E2E_BASE_URL` to a
 * deployed URL — a Vercel preview deployment, say — to run the same specs
 * against real infrastructure as a post-deploy gate.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

/** The signed-in tier only exists when there is a Supabase project to sign in to. */
const credentials = e2eCredentials();

/**
 * Pixel baselines are platform-specific, so they are opt-in: the project joins
 * the run once a baseline directory exists. `npm run e2e:visual:update`
 * creates it. See docs/e2e-testing.md before committing baselines.
 */
const VISUAL_BASELINES = 'e2e/visual/__screenshots__';

if (!credentials) {
	console.warn(
		'[e2e] Signed-in specs skipped: set PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ' +
			'E2E_USER_EMAIL to run them. The signed-out tier needs no credentials.'
	);
}

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// One retry in CI distinguishes a genuine failure from a lost network hop.
	// A test that only passes on the retry is a bug to fix, not a flake to live
	// with — the HTML report flags it.
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }]]
		: [['list'], ['html', { open: 'never' }]],
	timeout: 30_000,
	expect: { timeout: 7_500 },
	snapshotPathTemplate: '{testDir}/visual/__screenshots__/{platform}/{arg}{ext}',
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'guest',
			testDir: 'e2e/guest',
			use: { ...devices['Desktop Chrome'] }
		},
		...(credentials
			? [
					{
						name: 'setup',
						testMatch: /auth\.setup\.ts$/,
						use: { ...devices['Desktop Chrome'] }
					},
					{
						name: 'app',
						testDir: 'e2e/app',
						dependencies: ['setup'],
						use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE }
					}
				]
			: []),
		...(credentials && existsSync(VISUAL_BASELINES)
			? [
					{
						name: 'visual',
						testDir: 'e2e/visual',
						dependencies: ['setup'],
						use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE }
					}
				]
			: [])
	],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				// The production build, not the dev server: it is what Vercel runs,
				// and it is the only way the CSP and security headers under test
				// match what a real visitor gets.
				command: 'npm run build && npm run preview -- --port 4173 --strictPort',
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 180_000
			}
});
