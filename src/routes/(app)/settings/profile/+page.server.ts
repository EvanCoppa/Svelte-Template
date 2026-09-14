import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	findGravatarHash,
	gravatarUrl,
	uploadAvatar,
	useAvatarUrl,
	useInitialsAvatar
} from '$lib/server/profile';
import { avatarInitialsSchema, avatarUploadSchema, avatarUrlSchema, profileSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One page, four forms: the display name, and the three doors to a profile
 * photo (upload / a URL someone else hosts / initials). Each gets its own
 * superform id, the way the record page's several forms do, so a failure in
 * one never repaints another.
 */
const FORM_IDS = {
	profile: 'profile',
	avatarUpload: 'avatar-upload',
	avatarUrl: 'avatar-url',
	avatarInitials: 'avatar-initials'
} as const;

export const load: PageServerLoad = async ({ locals: { user }, parent, fetch }) => {
	if (!user) throw redirect(303, '/login');

	// The row itself comes from the (app) layout, which already reads it for
	// the user menu and declares QUERY.profile — so saving a photo here
	// refreshes the sidebar and this page from one query, not two.
	const [{ profile }, gravatarHash] = await Promise.all([
		parent(),
		// Probed server-side because the CSP's connect-src does not admit
		// gravatar.com, and an <img> cannot report a 404 back to the page.
		findGravatarHash(user.email, fetch)
	]);

	const [profileForm, avatarUploadForm, avatarUrlForm, avatarInitialsForm] = await Promise.all([
		superValidate({ display_name: profile?.display_name ?? '' }, zod4(profileSchema), {
			id: FORM_IDS.profile,
			errors: false
		}),
		superValidate(zod4(avatarUploadSchema), { id: FORM_IDS.avatarUpload }),
		superValidate(zod4(avatarUrlSchema), { id: FORM_IDS.avatarUrl }),
		superValidate(zod4(avatarInitialsSchema), { id: FORM_IDS.avatarInitials })
	]);

	return {
		gravatarUrl: gravatarHash ? gravatarUrl(gravatarHash) : null,
		profileForm,
		avatarUploadForm,
		avatarUrlForm,
		avatarInitialsForm
	};
};

export const actions: Actions = {
	updateProfile: async ({ request, locals: { supabase, user } }) => {
		if (!user) throw redirect(303, '/login');

		const form = await superValidate(request, zod4(profileSchema), { id: FORM_IDS.profile });
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase
			.from('profiles')
			.update({ display_name: form.data.display_name || null })
			.eq('id', user.id);
		if (error) return message(form, error.message, { status: 400 });

		return { form };
	},

	uploadAvatar: async ({ request, locals: { supabase, user } }) => {
		if (!user) throw redirect(303, '/login');

		const form = await superValidate(request, zod4(avatarUploadSchema), {
			id: FORM_IDS.avatarUpload
		});
		if (!form.valid) return fail(400, { form });

		try {
			await uploadAvatar(supabase, user.id, form.data.file);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save that photo.', {
				status: 400
			});
		}
		return { form };
	},

	useAvatarUrl: async ({ request, locals: { supabase, user } }) => {
		if (!user) throw redirect(303, '/login');

		// The schema is the allowlist: a URL from anywhere else never reaches
		// the column, and would not render under the CSP if it did.
		const form = await superValidate(request, zod4(avatarUrlSchema), { id: FORM_IDS.avatarUrl });
		if (!form.valid) return fail(400, { form });

		try {
			await useAvatarUrl(supabase, user.id, form.data.url);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save that photo.', {
				status: 400
			});
		}
		return { form };
	},

	useInitials: async ({ request, locals: { supabase, user } }) => {
		if (!user) throw redirect(303, '/login');

		const form = await superValidate(request, zod4(avatarInitialsSchema), {
			id: FORM_IDS.avatarInitials
		});
		if (!form.valid) return fail(400, { form });

		try {
			await useInitialsAvatar(supabase, user.id, form.data.tint);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save that.', {
				status: 400
			});
		}
		return { form };
	}
};
