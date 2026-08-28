import { fail } from '@sveltejs/kit';
import { validateNewPassword } from '$lib/server/password-recovery';
import type { Actions } from './$types';

export const actions: Actions = {
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
