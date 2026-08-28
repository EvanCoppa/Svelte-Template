import { fail, redirect } from '@sveltejs/kit';
import {
	endPasswordRecovery,
	isPasswordRecovery,
	PASSWORD_MIN_LENGTH,
	validateNewPassword
} from '$lib/server/password-recovery';
import type { Actions, PageServerLoad } from './$types';

const EXPIRED = '/login?error=recovery_link_invalid';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	// Reachable only by a browser that just verified a recovery link — the guard
	// in hooks.server.ts sends everyone else here, so re-check the marker rather
	// than letting any signed-in session change a password unprompted.
	if (!locals.session || !isPasswordRecovery(cookies)) throw redirect(303, EXPIRED);
	return { email: locals.user?.email ?? null, minLength: PASSWORD_MIN_LENGTH };
};

export const actions: Actions = {
	default: async ({ request, cookies, locals: { supabase } }) => {
		if (!isPasswordRecovery(cookies)) throw redirect(303, EXPIRED);

		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirmation = String(form.get('confirm_password') ?? '');

		const problem = validateNewPassword(password, confirmation);
		if (problem) return fail(400, { message: problem });

		const { error } = await supabase.auth.updateUser({ password });
		if (error) return fail(400, { message: error.message });

		// Clear the marker first so the guard stops pinning this browser here,
		// then drop the session: signing back in proves the new password works,
		// and a reset should not leave the emailed link's session standing.
		endPasswordRecovery(cookies);
		await supabase.auth.signOut();

		throw redirect(303, '/login?reset=success');
	}
};
