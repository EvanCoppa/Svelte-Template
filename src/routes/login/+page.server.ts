import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loginSchema, resetSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/** Human-readable banners for `?error=` codes set by hooks and /auth/confirm. */
const ERROR_MESSAGES: Record<string, string> = {
	link_invalid: 'That link is invalid or has expired. Request a new one below.',
	recovery_link_invalid:
		'That password reset link is invalid or has expired. Request a new one below.'
};

export const load: PageServerLoad = async ({ url }) => {
	const errorCode = url.searchParams.get('error');
	const [loginForm, resetForm] = await Promise.all([
		superValidate({ next: url.searchParams.get('next') ?? '/' }, zod4(loginSchema), {
			errors: false
		}),
		superValidate(zod4(resetSchema))
	]);
	return {
		errorMessage: errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Something went wrong.') : null,
		passwordReset: url.searchParams.get('reset') === 'success',
		loginForm,
		resetForm
	};
};

export const actions: Actions = {
	login: async ({ request, locals: { supabase } }) => {
		const form = await superValidate(request, zod4(loginSchema));
		// superforms echoes `form.data` back to the browser on failure — never
		// send the password on that round trip.
		const password = form.data.password;
		form.data.password = '';

		if (!form.valid) return fail(400, { form });

		const { error } = await supabase.auth.signInWithPassword({ email: form.data.email, password });
		if (error) {
			// One generic message for every failure — the difference between "no
			// such account" and "wrong password" is information an attacker wants.
			return message(form, 'Invalid email or password.', { status: 400 });
		}

		// `next` round-trips through the form from the URL, so treat it as
		// untrusted: allow only internal paths.
		const next = form.data.next;
		const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
		throw redirect(303, safeNext);
	},

	reset: async ({ request, locals: { supabase }, url }) => {
		const form = await superValidate(request, zod4(resetSchema));
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase.auth.resetPasswordForEmail(form.data.email, {
			redirectTo: `${url.origin}/auth/confirm?type=recovery`
		});

		// Report the same thing either way. Surfacing Supabase's error would tell
		// an anonymous caller which addresses have accounts and when they have
		// been rate limited; the operator still gets the detail in the log.
		if (error) console.warn('[login/reset] resetPasswordForEmail failed', error.message);

		return message(form, 'If that email has an account, a password reset link is on its way.');
	}
};
