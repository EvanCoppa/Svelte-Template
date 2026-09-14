import { z } from 'zod';
import { AVATAR_TONES } from '$lib/components/ui/avatar/index.js';

export const profileSchema = z.object({
	display_name: z
		.string()
		.trim()
		.max(100, 'Display name must be 100 characters or fewer.')
		.default('')
});

/**
 * The three ways a profile photo is set, one schema each, because they are
 * three different posts: a file, a URL someone else hosts, and a colour.
 * They write the same two columns (see the profile_photos migration), so
 * nothing downstream branches on which one was used.
 *
 * `MAX_AVATAR_BYTES` / `ACCEPTED_AVATAR_TYPES` are shared with
 * `$lib/server/profile`, which checks them again on the storage path — a
 * schema alone would not stop a request that skips the browser. The same
 * split `$lib/schemas/entity-images` makes.
 */

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_AVATAR_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif'
] as const;

export const avatarUploadSchema = z.object({
	file: z
		.instanceof(File, { message: 'Choose a photo to upload.' })
		.refine((file) => file.size > 0, 'Choose a photo to upload.')
		.refine((file) => file.size <= MAX_AVATAR_BYTES, 'Photos must be 5MB or smaller.')
		.refine(
			(file) => ACCEPTED_AVATAR_TYPES.some((type) => type === file.type),
			'Use a JPEG, PNG, WebP or GIF image.'
		)
});

/**
 * The hosts a profile photo may be pointed at without uploading one. An
 * allowlist rather than "any https URL": `avatar_url` is rendered in every
 * other member's browser, so an arbitrary host would be a way to have the
 * whole org's browsers call it, and every entry here also has to be in the
 * CSP's `img-src` to render at all (see security-headers.ts).
 */
export const AVATAR_URL_HOSTS = ['api.dicebear.com', 'gravatar.com'] as const;

function isAllowedAvatarHost(value: string): boolean {
	const url = URL.parse(value);
	if (url?.protocol !== 'https:') return false;
	return AVATAR_URL_HOSTS.some((host) => url.hostname === host);
}

export const avatarUrlSchema = z.object({
	url: z.string().trim().refine(isAllowedAvatarHost, 'That image is not from a source we can show.')
});

export const avatarInitialsSchema = z.object({
	tint: z.enum(AVATAR_TONES, { message: 'Pick a colour.' })
});
