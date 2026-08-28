import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { newPasswordSchema } from '$lib/schemas/password';
import { endPasswordRecovery, isPasswordRecovery } from '$lib/server/password-recovery';
import type { Actions, PageServerLoad } from './$types';

const EXPIRED = '/login?error=recovery_link_invalid';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	// Reachable only by a browser that just verified a recovery link — the guard
	// in hooks.server.ts sends everyone else here, so re-check the marker rather
	// than letting any signed-in session change a password unprompted.
	if (!locals.session || !isPasswordRecovery(cookies)) throw redirect(303, EXPIRED);
	const form = await superValidate(zod4(newPasswordSchema));
	return { email: locals.user?.email ?? null, form };
};

export const actions: Actions = {
	default: async ({ request, cookies, locals: { supabase } }) => {
		if (!isPasswordRecovery(cookies)) throw redirect(303, EXPIRED);

		const form = await superValidate(request, zod4(newPasswordSchema));
		// superforms echoes `form.data` back to the browser on failure — never
		// send passwords on that round trip.
		const password = form.data.password;
		form.data.password = '';
		form.data.confirm_password = '';

		if (!form.valid) return fail(400, { form });

		const { error } = await supabase.auth.updateUser({ password });
		if (error) return message(form, error.message, { status: 400 });

		// Clear the marker first so the guard stops pinning this browser here,
		// then drop the session: signing back in proves the new password works,
		// and a reset should not leave the emailed link's session standing.
		endPasswordRecovery(cookies);
		await supabase.auth.signOut();

		throw redirect(303, '/login?reset=success');
	}
};
