/**
 * Development-only auto-login.
 *
 * Automated agents (and humans) that spin the app up to exercise a new UI
 * feature hit the auth guard in `hooks.server.ts` before they can see
 * anything. When `DEV_AUTO_LOGIN` is enabled this module mints a Supabase
 * magic link with the service-role key and redeems it server-side, so the
 * request continues with a real, fully-authenticated session — no password,
 * no email round-trip, no test credentials checked into the repo.
 *
 * This is a genuine authentication bypass. It is inert unless the private
 * `DEV_AUTO_LOGIN` env var is explicitly set, and it hard-refuses to run on a
 * Vercel production deployment. Never set the flag in production.
 */
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from '$lib/supabase.server';

/**
 * Set when someone explicitly signs out, so "signed out" states stay testable
 * instead of the guard immediately signing them back in. Cleared by requesting
 * any page with `?autologin=1`.
 */
export const DEV_AUTO_LOGIN_OPT_OUT_COOKIE = 'dev_auto_login_off';
export const DEV_AUTO_LOGIN_RESET_PARAM = 'autologin';

/**
 * Paths that must keep their unauthenticated behaviour even with auto-login
 * on: `/logout` has to actually log out, and the emailed-link flows under
 * `/auth` need to be testable as a signed-out browser.
 */
const SKIP_PREFIXES = ['/logout', '/auth'];

export interface DevAutoLoginConfig {
	email: string;
}

/** The slice of the request-scoped Supabase client that redeeming a link uses. */
export interface AutoLoginClient {
	auth: Pick<SupabaseClient['auth'], 'verifyOtp'>;
}

/** The slice of the service-role client that minting a link uses. */
export interface AutoLoginAdminClient {
	auth: { admin: Pick<SupabaseClient['auth']['admin'], 'generateLink' | 'createUser'> };
}

/**
 * The env vars the feature reads, injectable so tests can vary them.
 *
 * The index signature matters, not just documents intent: without it this is
 * a TS "weak type" (every property optional), so passing the real
 * `$env/dynamic/private` env — whose generated type is a snapshot of
 * whatever variables happen to be set wherever `svelte-kit sync` last ran —
 * only type-checks when at least one property name coincidentally matches.
 * That is exactly the kind of environment-dependent flake this repo's own
 * anti-slop rules exist to catch.
 */
export interface DevAutoLoginEnv {
	DEV_AUTO_LOGIN?: string | undefined;
	DEV_AUTO_LOGIN_EMAIL?: string | undefined;
	SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
	VERCEL_ENV?: string | undefined;
	[key: string]: string | undefined;
}

export interface DevAutoLoginDeps {
	createAdminClient?: () => AutoLoginAdminClient;
	envSource?: DevAutoLoginEnv;
}

function isTruthy(raw: string | undefined): boolean {
	return ['1', 'true', 'yes', 'on'].includes((raw ?? '').trim().toLowerCase());
}

/**
 * Resolve the auto-login identity, or `null` when the feature is off or
 * unsafe. Refusals are logged loudly — a misconfigured flag should never be
 * silent.
 */
export function devAutoLoginConfig(source: DevAutoLoginEnv = env): DevAutoLoginConfig | null {
	if (!isTruthy(source.DEV_AUTO_LOGIN)) return null;

	if ((source.VERCEL_ENV ?? '').trim().toLowerCase() === 'production') {
		console.error(
			'[dev-auto-login] REFUSING to run: DEV_AUTO_LOGIN is set on a production deployment. ' +
				'Remove the variable from the production environment immediately.'
		);
		return null;
	}

	if (!source.SUPABASE_SERVICE_ROLE_KEY) {
		console.error(
			'[dev-auto-login] DEV_AUTO_LOGIN is set but SUPABASE_SERVICE_ROLE_KEY is missing — auto-login disabled.'
		);
		return null;
	}

	const email = (source.DEV_AUTO_LOGIN_EMAIL ?? '').trim().toLowerCase();
	if (!email) {
		console.error(
			'[dev-auto-login] DEV_AUTO_LOGIN is set but DEV_AUTO_LOGIN_EMAIL is not — auto-login disabled.'
		);
		return null;
	}

	return { email };
}

/** Cheap check for callers that only need to know whether the feature is live. */
export function isDevAutoLoginEnabled(source: DevAutoLoginEnv = env): boolean {
	return devAutoLoginConfig(source) !== null;
}

/** Whether this particular request should be auto-authenticated. */
export function shouldAttemptDevAutoLogin(request: {
	pathname: string;
	optedOut: boolean;
}): boolean {
	if (request.optedOut) return false;
	return !SKIP_PREFIXES.some(
		(prefix) => request.pathname === prefix || request.pathname.startsWith(`${prefix}/`)
	);
}

/**
 * Make sure the auto-login user exists in `auth.users` and return a
 * single-use magic-link token hash for it. Creates the user on a fresh
 * database so a new Supabase project works with no seeding (the signup
 * trigger from the starter migration creates the profile row).
 */
async function mintMagicLink(
	admin: AutoLoginAdminClient,
	email: string
): Promise<{ tokenHash: string } | null> {
	let link = await admin.auth.admin.generateLink({ type: 'magiclink', email });

	if (link.error || !link.data.properties?.hashed_token) {
		// Most likely the user does not exist yet. Create them and retry once;
		// if creation fails, report the original failure.
		const created = await admin.auth.admin.createUser({ email, email_confirm: true });
		if (created.error) {
			console.error(
				`[dev-auto-login] Could not create or find ${email}: ` +
					`${link.error?.message ?? 'no magic link returned'} / ${created.error.message}`
			);
			return null;
		}
		console.warn(`[dev-auto-login] Created auth user ${email}.`);
		link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
	}

	const tokenHash = link.data.properties?.hashed_token;
	if (link.error || !tokenHash) {
		console.error(
			`[dev-auto-login] Magic link generation failed for ${email}: ${link.error?.message ?? 'no token returned'}`
		);
		return null;
	}

	return { tokenHash };
}

/**
 * Sign the configured user in on `client` (the request's `@supabase/ssr`
 * client), which writes the session cookies onto the outgoing response.
 * Returns `null` — leaving the request unauthenticated — on any failure.
 */
export async function devAutoLogin(
	client: AutoLoginClient,
	deps: DevAutoLoginDeps = {}
): Promise<{ session: Session; user: User } | null> {
	const config = devAutoLoginConfig(deps.envSource ?? env);
	if (!config) return null;

	let admin: AutoLoginAdminClient;
	try {
		admin = (deps.createAdminClient ?? createSupabaseAdminClient)();
	} catch (err) {
		console.error('[dev-auto-login] Could not create the service-role client:', err);
		return null;
	}

	const link = await mintMagicLink(admin, config.email);
	if (!link) return null;

	const { data, error } = await client.auth.verifyOtp({
		token_hash: link.tokenHash,
		type: 'magiclink'
	});

	if (error || !data.session || !data.user) {
		console.error(
			`[dev-auto-login] Redeeming the magic link failed: ${error?.message ?? 'no session returned'}`
		);
		return null;
	}

	console.warn(
		`[dev-auto-login] Signed in as ${config.email} with no credentials — ` +
			'DEV_AUTO_LOGIN is on. This must never be enabled in production.'
	);

	return { session: data.session, user: data.user };
}
