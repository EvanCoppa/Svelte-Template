import { z } from 'zod';

/**
 * The product image upload form — the product page's action validates with
 * it and `./product-image.svelte` renders it. Mirrors `entity-images`' limits
 * exactly, but there is one field (`file`, no caption) because
 * `products.image_url` is a single storefront picture, not a gallery.
 */

export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_PRODUCT_IMAGE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif'
] as const;

export const productImageUploadSchema = z.object({
	file: z
		.instanceof(File, { message: 'Choose an image to upload.' })
		.refine((file) => file.size > 0, 'Choose an image to upload.')
		.refine((file) => file.size <= MAX_PRODUCT_IMAGE_BYTES, 'Images must be 10MB or smaller.')
		.refine(
			(file) => ACCEPTED_PRODUCT_IMAGE_TYPES.some((type) => type === file.type),
			'Use a JPEG, PNG, WebP or GIF image.'
		)
});

export const removeProductImageSchema = z.object({});
