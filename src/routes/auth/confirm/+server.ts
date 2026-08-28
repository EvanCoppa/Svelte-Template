import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import { startPasswordRecovery } from '$lib/server/password-recovery';
import type { RequestHandler } from './$types';

/**
 * Lands every emailed auth link (password recovery, email confirmation,
 * invites, email change). Exchanges the link's token for a session, then
 * routes by link type.
 *
 * Supabase sends one of two link shapes depending on the project's email
 * template: a `token_hash` (verifiable from any device — the recommended
 * server-side template, see README) or a PKCE `code` (only redeemable in the
 * browser that requested the email, via its stored code verifier). Handle
 * both so the flow survives either template configuration.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase }, cookies }) => {
	const tokenHash = url.searchParams.get('token_hash');
	const code = url.searchParams.get('code');
	// SAFETY: `type` is untrusted query input; Supabase's verifyOtp validates it
	// at runtime and an unrecognized value lands in the failure path below.
	const type = (url.searchParams.get('type') ?? 'recovery') as EmailOtpType;
	const next = url.searchParams.get('next') ?? '/';

	let failure: string | null;
	if (tokenHash) {
		const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
		failure = error?.message ?? null;
	} else if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		failure = error?.message ?? null;
	} else {
		failure = 'Link is missing its token.';
	}

	if (failure) {
		// Log the detail server-side; the user just needs "this link didn't work".
		console.warn('[auth/confirm] rejected link', { type, message: failure });
		throw redirect(303, '/login?error=link_invalid');
	}

	if (type === 'recovery') {
		startPasswordRecovery(cookies);
		throw redirect(303, '/reset-password');
	}

	// Only allow internal destinations — `next` comes from the URL.
	const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
	throw redirect(303, safeNext);
};
