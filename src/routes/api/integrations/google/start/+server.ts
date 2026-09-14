import { error, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { authorizationUrl, pkcePair } from '$lib/server/integrations/google/oauth';
import { requireEmailAccess } from '$lib/server/mail-sync/access';
import { MAIL_SYNC_UNCONFIGURED, mailSyncConfig } from '$lib/server/mail-sync/config';
import { googleCallbackUrl, startGoogleOAuth } from '$lib/server/mail-sync/oauth-state';
import type { RequestHandler } from './$types';

/**
 * Begin connecting a Google mailbox: pin a state and a PKCE verifier to the
 * browser, then send it to Google's consent screen.
 *
 * A GET endpoint reached by a link, not a form action — the one exception
 * CLAUDE.md's "every mutation is a form action" needs here: the response
 * headers' `form-action 'self'` refuses a post-submit redirect to
 * accounts.google.com, and nothing is mutated until Google comes back to the
 * callback. `/api/*` is exempt from the feature gate, so the access check is
 * asked here, the way `/api/notes` asks it.
 */
export const GET: RequestHandler = async (event) => {
	const config = mailSyncConfig();
	if (!config) throw error(503, MAIL_SYNC_UNCONFIGURED);
	const { orgId, userId } = await requireEmailAccess(event, 'manage');

	const { verifier, challenge } = pkcePair();
	const state = randomBytes(24).toString('base64url');
	startGoogleOAuth(event.cookies, { state, verifier, orgId, userId });

	throw redirect(
		303,
		authorizationUrl(config.oauth, {
			redirectUri: googleCallbackUrl(event.url.origin),
			state,
			codeChallenge: challenge,
			loginHint: event.locals.user?.email ?? null
		})
	);
};
