/**
 * Which Supabase project the E2E run is pointed at, and whether it is real.
 *
 * The suite is designed to be useful with no setup at all: the specs that only
 * exercise the route guard run against placeholder credentials, because an
 * unauthenticated request never reaches Supabase — `safeGetSession()` finds no
 * cookie and the guard redirects before any network call.
 *
 * The specs that actually sign in need a live stack. Bring one up with:
 *
 *   npm run db:start && npm run db:env
 *
 * …and they stop skipping. Imported by playwright.config.ts too, so the dev
 * server it launches and the tests talking to it always agree.
 */
import { readEnvFiles } from '../scripts/dotenv.mjs';

/**
 * Obviously-fake values, matching the ones .github/workflows/ci.yml uses for
 * the build. `$env/static/public` must resolve to *something* or the app will
 * not boot, but these are never contacted.
 */
export const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
export const PLACEHOLDER_KEY = 'sb_publishable_placeholder';

const files = readEnvFiles();

function fromEnv(name: string): string | undefined {
	return process.env[name] ?? files[name];
}

export const SUPABASE_URL = fromEnv('PUBLIC_SUPABASE_URL') ?? PLACEHOLDER_URL;
export const SUPABASE_KEY = fromEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY') ?? PLACEHOLDER_KEY;

/** Credentials from supabase/seed.sql unless the run overrides them. */
export const TEST_USER = {
	email: fromEnv('E2E_USER_EMAIL') ?? 'e2e@example.com',
	password: fromEnv('E2E_USER_PASSWORD') ?? 'password123'
};

const HAS_CREDENTIALS = SUPABASE_URL !== PLACEHOLDER_URL && SUPABASE_KEY !== PLACEHOLDER_KEY;

/**
 * Whether a real Auth server is answering. Cached: every spec file asks, and
 * the answer cannot change mid-run.
 */
let reachable: Promise<boolean> | null = null;

export function authStackReachable(): Promise<boolean> {
	if (!HAS_CREDENTIALS) return Promise.resolve(false);
	reachable ??= (async () => {
		try {
			const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
				headers: { apikey: SUPABASE_KEY },
				signal: AbortSignal.timeout(5000)
			});
			return response.ok;
		} catch {
			return false;
		}
	})();
	return reachable;
}

export const NO_STACK_REASON =
	'No Supabase stack reachable — run `npm run db:start && npm run db:env` to run these.';
