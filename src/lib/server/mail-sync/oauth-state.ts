import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';

/**
 * The state of one Google consent round trip, pinned to the browser that
 * started it (the password-recovery cookie's pattern). `/api/integrations/
 * google/start` writes it and redirects to Google; the callback reads it
 * back, checks the `state` Google echoes against it, spends the PKCE
 * verifier, and deletes it. Ten minutes is longer than any consent screen
 * takes and shorter than any attack that waits.
 *
 * The org and user are pinned too: the callback connects the mailbox to the
 * membership that asked, never to whichever session the browser holds when
 * Google comes back.
 */

export const GOOGLE_OAUTH_COOKIE = 'google-oauth';
const COOKIE_PATH = '/api/integrations/google';
const MAX_AGE = 60 * 10;

const stateSchema = z.object({
	state: z.string().min(16),
	verifier: z.string().min(43),
	orgId: z.guid(),
	userId: z.guid()
});

export type GoogleOAuthState = z.infer<typeof stateSchema>;

export function startGoogleOAuth(cookies: Pick<Cookies, 'set'>, state: GoogleOAuthState): void {
	cookies.set(GOOGLE_OAUTH_COOKIE, JSON.stringify(state), {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: MAX_AGE
	});
}

export function readGoogleOAuth(cookies: Pick<Cookies, 'get'>): GoogleOAuthState | null {
	const raw = cookies.get(GOOGLE_OAUTH_COOKIE);
	if (!raw) return null;
	try {
		const parsed = stateSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export function endGoogleOAuth(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(GOOGLE_OAUTH_COOKIE, { path: COOKIE_PATH });
}

/** Where Google sends the browser back — registered verbatim on the OAuth client. */
export function googleCallbackUrl(origin: string): string {
	return `${origin}/api/integrations/google/callback`;
}
