import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { newPasswordSchema } from '$lib/schemas/password';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { passwordForm: await superValidate(zod4(newPasswordSchema)) };
};

export const actions: Actions = {
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
