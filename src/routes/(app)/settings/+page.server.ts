import { fail, redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { validateNewPassword } from '$lib/server/password-recovery';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, user }, depends }) => {
	if (!user) throw redirect(303, '/login');
	depends(QUERY.profile);

	// Fully typed by the generated schema (see src/lib/database.types.ts), and
	// RLS guarantees this can only ever return the caller's own row. `error`
	// is tolerated so a project that hasn't applied the starter migration yet
	// renders a hint instead of a 500.
	const { data: profile, error } = await supabase
		.from('profiles')
		.select('*')
		.eq('id', user.id)
		.maybeSingle();
	if (error) console.warn('[settings] profile lookup failed', error.message);

	return { profile };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals: { supabase, user } }) => {
		if (!user) throw redirect(303, '/login');

		const form = await request.formData();
		const displayName = String(form.get('display_name') ?? '').trim();
		if (displayName.length > 100) {
			return fail(400, { profileMessage: 'Display name must be 100 characters or fewer.' });
		}

		const { error } = await supabase
			.from('profiles')
			.update({ display_name: displayName || null })
			.eq('id', user.id);
		if (error) return fail(400, { profileMessage: error.message });

		return { profileSaved: true };
	},

	changePassword: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirmation = String(form.get('confirm_password') ?? '');

		const problem = validateNewPassword(password, confirmation);
		if (problem) return fail(400, { message: problem });

		const { error } = await supabase.auth.updateUser({ password });
		if (error) return fail(400, { message: error.message });

		return { changed: true };
	}
};
