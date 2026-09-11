import { z } from 'zod';

/**
 * The image upload form — the record page's action validates with it and
 * `Detail.Images` renders it. One image per submit, the way an address is
 * one form per submit: `file` is required on upload, `caption` optional.
 *
 * `MAX_IMAGE_BYTES` and `ACCEPTED_IMAGE_TYPES` are shared with the server
 * module (`$lib/server/crm/entity-images`), which enforces the same limits
 * again on the storage path — a schema check alone would not stop a request
 * that skips the browser.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export const imageUploadSchema = z.object({
	file: z
		.instanceof(File, { message: 'Choose an image to upload.' })
		.refine((file) => file.size > 0, 'Choose an image to upload.')
		.refine((file) => file.size <= MAX_IMAGE_BYTES, 'Images must be 10MB or smaller.')
		.refine(
			(file) => ACCEPTED_IMAGE_TYPES.some((type) => type === file.type),
			'Use a JPEG, PNG, WebP or GIF image.'
		),
	caption: z.string().trim().max(200, 'Must be 200 characters or fewer.').default('')
});

export const removeImageSchema = z.object({ id: z.guid() });
