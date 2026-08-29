import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { STORAGE_STATE, e2eCredentials, mintMagicLink } from './support/session';

/**
 * Signs the test account in once per run and saves the cookies the app tier
 * reuses, so no spec spends time on a login form it is not testing.
 *
 * The session is minted the way a real emailed link is redeemed — through
 * `/auth/confirm` — so what the specs run against is an ordinary
 * `@supabase/ssr` session, not a fixture the app would never produce.
 */
setup('sign the test account in', async ({ page }) => {
	const credentials = e2eCredentials();
	// `playwright.config.ts` only declares this project when credentials exist.
	if (!credentials) throw new Error('[e2e] Missing Supabase credentials for the signed-in tier.');

	const tokenHash = await mintMagicLink(credentials);

	await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=/`);

	// Landing on the dashboard is the proof the session took: the auth guard
	// would have bounced an unauthenticated browser straight back to /login.
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

	mkdirSync(dirname(STORAGE_STATE), { recursive: true });
	await page.context().storageState({ path: STORAGE_STATE });
});
