import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** Human-readable banners for `?error=` codes set by hooks and /auth/confirm. */
const ERROR_MESSAGES: Record<string, string> = {
	link_invalid: 'That link is invalid or has expired. Request a new one below.',
	recovery_link_invalid:
		'That password reset link is invalid or has expired. Request a new one below.'
};

export const load: PageServerLoad = async ({ url }) => {
	const errorCode = url.searchParams.get('error');
	return {
		errorMessage: errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Something went wrong.') : null,
		passwordReset: url.searchParams.get('reset') === 'success',
		next: url.searchParams.get('next') ?? '/'
	};
};

export const actions: Actions = {
	login: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const next = String(form.get('next') ?? '/');

		if (!email || !password) {
			return fail(400, { email, message: 'Enter your email and password.' });
		}

		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) {
			// One generic message for every failure — the difference between "no
			// such account" and "wrong password" is information an attacker wants.
			return fail(400, { email, message: 'Invalid email or password.' });
		}

		// `next` round-trips through the form from the URL, so treat it as
		// untrusted: allow only internal paths.
		const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
		throw redirect(303, safeNext);
	},

	reset: async ({ request, locals: { supabase }, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!email) {
			return fail(400, { email, resetOk: false, message: 'Enter your email to reset.' });
		}

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/confirm?type=recovery`
		});

		// Report the same thing either way. Surfacing Supabase's error would tell
		// an anonymous caller which addresses have accounts and when they have
		// been rate limited; the operator still gets the detail in the log.
		if (error) console.warn('[login/reset] resetPasswordForEmail failed', error.message);

		return {
			email,
			resetOk: true,
			message: 'If that email has an account, a password reset link is on its way.'
		};
	}
};
