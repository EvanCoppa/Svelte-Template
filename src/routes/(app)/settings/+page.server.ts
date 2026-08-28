import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { newPasswordSchema } from '$lib/schemas/password';
import { profileSchema } from './schema';
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

	const [profileForm, passwordForm] = await Promise.all([
		superValidate({ display_name: profile?.display_name ?? '' }, zod4(profileSchema), {
			errors: false
		}),
		superValidate(zod4(newPasswordSchema))
	]);

	return { profile, profileForm, passwordForm };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals: { supabase, user } }) => {
		if (!user) throw redirect(303, '/login');

		const form = await superValidate(request, zod4(profileSchema));
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase
			.from('profiles')
			.update({ display_name: form.data.display_name || null })
			.eq('id', user.id);
		if (error) return message(form, error.message, { status: 400 });

		return { form };
	},

	changePassword: async ({ request, locals: { supabase } }) => {
		const form = await superValidate(request, zod4(newPasswordSchema));
		// superforms echoes `form.data` back to the browser — never send
		// passwords on that round trip.
		const password = form.data.password;
		form.data.password = '';
		form.data.confirm_password = '';

		if (!form.valid) return fail(400, { form });

		const { error } = await supabase.auth.updateUser({ password });
		if (error) return message(form, error.message, { status: 400 });

		return { form };
	}
};
