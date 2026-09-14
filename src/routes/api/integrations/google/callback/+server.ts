import { error, redirect } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { gmailClient } from '$lib/server/integrations/google/gmail';
import {
	GMAIL_SCOPES,
	exchangeCode,
	hasScopes,
	revokeToken
} from '$lib/server/integrations/google/oauth';
import { connectMailbox } from '$lib/server/crm/mailboxes';
import { requireEmailAccess } from '$lib/server/mail-sync/access';
import { MAIL_SYNC_UNCONFIGURED, mailSyncConfig } from '$lib/server/mail-sync/config';
import {
	endGoogleOAuth,
	googleCallbackUrl,
	readGoogleOAuth
} from '$lib/server/mail-sync/oauth-state';
import { sealSecret } from '$lib/server/mail-sync/tokens';
import type { RequestHandler } from './$types';

/**
 * Where Google sends the browser back. Everything written here is derived
 * from what Google answered — the address, the cursor, the tokens — through
 * the service-role client, the way `/invite/[token]` writes what a token
 * proves. A refusal at any step lands on the settings page with a reason
 * in the query string, never on an error page: the person was mid-consent.
 */

const SETTINGS = '/settings/integrations';

function back(reason: string): never {
	throw redirect(303, `${SETTINGS}?error=${encodeURIComponent(reason)}`);
}

export const GET: RequestHandler = async (event) => {
	const config = mailSyncConfig();
	if (!config) throw error(503, MAIL_SYNC_UNCONFIGURED);

	const pending = readGoogleOAuth(event.cookies);
	endGoogleOAuth(event.cookies);
	if (!pending) back('expired');

	const params = event.url.searchParams;
	if (params.get('error')) back('denied');
	const code = params.get('code');
	if (!code || params.get('state') !== pending.state) back('state');

	// The browser that comes back must be the session that started, in the
	// same org: a consent cannot be redeemed into somebody else's membership.
	const { orgId, userId } = await requireEmailAccess(event, 'manage');
	if (orgId !== pending.orgId || userId !== pending.userId) back('session');

	const tokens = await exchangeCode(config.oauth, {
		code,
		redirectUri: googleCallbackUrl(event.url.origin),
		codeVerifier: pending.verifier
	});
	if (!tokens.ok) back('exchange');

	// Google's granular consent lets a person untick a scope; half a grant is
	// no grant, and it is revoked so it does not linger on their account.
	if (!hasScopes(tokens.scope, GMAIL_SCOPES) || !tokens.refreshToken) {
		await revokeToken(tokens.accessToken);
		back(tokens.refreshToken ? 'scopes' : 'no_refresh');
	}

	const profile = await gmailClient(tokens.accessToken).getProfile();
	if (!profile.ok) {
		await revokeToken(tokens.refreshToken);
		back('profile');
	}

	const admin = createSupabaseAdminClient();
	const mailbox = await connectMailbox(admin, {
		orgId,
		userId,
		emailAddress: profile.value.emailAddress,
		historyId: profile.value.historyId,
		refreshTokenSealed: sealSecret(tokens.refreshToken, config.key),
		accessTokenSealed: sealSecret(tokens.accessToken, config.key),
		accessTokenExpiresAt: tokens.expiresAt,
		scopes: tokens.scope.split(' ').filter(Boolean)
	});

	throw redirect(303, `${SETTINGS}?connected=${encodeURIComponent(mailbox.email_address)}`);
};
