import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

/** Where `e2e/auth.setup.ts` writes the signed-in browser state the app tier reuses. */
export const STORAGE_STATE = fileURLToPath(new URL('../.auth/user.json', import.meta.url));

export interface E2ECredentials {
	/** The Supabase project the app under test is built against. */
	url: string;
	serviceRoleKey: string;
	/** The account the signed-in tier drives. Created on first run if missing. */
	email: string;
}

/**
 * The credentials the signed-in tier needs, or `null` when this checkout has
 * none. Returning `null` rather than throwing is what lets `npm run e2e` stay
 * green on a fresh clone: `playwright.config.ts` drops the signed-in projects
 * and the signed-out tier — the auth guard, the login form, the security
 * headers — still runs everywhere, CI and forks included.
 *
 * `DEV_AUTO_LOGIN_EMAIL` is accepted as a fallback so a `.env` already set up
 * for `npm run dev` needs no second variable.
 */
export function e2eCredentials(): E2ECredentials | null {
	const url = (process.env.PUBLIC_SUPABASE_URL ?? '').trim();
	const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
	const email = (process.env.E2E_USER_EMAIL ?? process.env.DEV_AUTO_LOGIN_EMAIL ?? '')
		.trim()
		.toLowerCase();

	if (!url || !serviceRoleKey || !email) return null;
	return { url, serviceRoleKey, email };
}

/**
 * Mint a single-use magic-link token for the test account, creating the
 * account when a fresh Supabase project has never seen it.
 *
 * This is the same service-role path `src/lib/server/dev-auto-login.ts` walks
 * for `npm run dev`, reimplemented here rather than imported because that
 * module reads `$env/dynamic/private`. Keeping it out of the app means no test
 * credential is ever checked in and no test-only code ships in the bundle:
 * `e2e/auth.setup.ts` redeems the token through the app's own `/auth/confirm`
 * endpoint, so the session under test is a genuine one.
 */
export async function mintMagicLink(credentials: E2ECredentials): Promise<string> {
	const admin = createClient<Database>(credentials.url, credentials.serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	const email = credentials.email;

	let link = await admin.auth.admin.generateLink({ type: 'magiclink', email });

	if (link.error || !link.data.properties?.hashed_token) {
		// Most likely the account does not exist yet. Create it and retry once;
		// if creation also fails, report the original failure alongside.
		const created = await admin.auth.admin.createUser({ email, email_confirm: true });
		if (created.error) {
			throw new Error(
				`[e2e] Could not create or find ${email}: ` +
					`${link.error?.message ?? 'no magic link returned'} / ${created.error.message}`
			);
		}
		console.warn(`[e2e] Created auth user ${email}.`);
		link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
	}

	const tokenHash = link.data.properties?.hashed_token;
	if (link.error || !tokenHash) {
		throw new Error(
			`[e2e] Magic link generation failed for ${email}: ` +
				`${link.error?.message ?? 'no token returned'}`
		);
	}

	return tokenHash;
}
