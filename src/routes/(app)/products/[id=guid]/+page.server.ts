import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { RECORD_KIND_META } from '$lib/crm/records';
import { clearProductImage, getProduct, setProductImage } from '$lib/server/crm/products';
import { loadRecordPage, recordPageActions } from '$lib/server/record-page';
import { requirePermission } from '$lib/server/roles';
import { productImageUploadSchema, removeProductImageSchema } from '$lib/schemas/products';
import type { Actions, PageServerLoad } from './$types';

/**
 * One product — a page of its own rather than the generic record page.
 *
 * A static segment outranks `[kind=record]`, so this takes over
 * `/products/<id>` and the generic page stays the default for every other
 * kind (the rule in `$lib/crm/records`). Sitting under `/products` is what
 * gates it, exactly as `/companies/[id=guid]` is gated.
 *
 * It earns the specific page for one thing the generic page and its shared
 * `RecordFields` loop cannot draw: the storefront picture at
 * `products.image_url`, uploaded into the public `product-images` bucket
 * rather than typed in as a raw URL. Everything else a record page shows —
 * the header, the tabs, the rail, the generic edit form — stays
 * `$lib/server/record-page.ts`, composed rather than copied.
 */

const PRODUCT_IMAGE_FORM_IDS = {
	upload: 'product-image',
	remove: 'remove-product-image'
} as const;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	// The raw column the generic `RecordDetail` fields never carry — read
	// again here rather than added to `describeProduct()`, which draws the
	// rail's field list, not this page's picture.
	const [shell, product, imageForm, removeImageForm] = await Promise.all([
		loadRecordPage(locals, 'product', params.id, depends),
		getProduct(supabase, activeOrgId, params.id),
		superValidate(zod4(productImageUploadSchema), { id: PRODUCT_IMAGE_FORM_IDS.upload }),
		superValidate(zod4(removeProductImageSchema), { id: PRODUCT_IMAGE_FORM_IDS.remove })
	]);
	return { ...shell, imageUrl: product?.image_url ?? null, imageForm, removeImageForm };
};

export const actions: Actions = {
	// The record's own fields, its relationships and every other action a
	// record page has — a product has no addresses, photos or conversation,
	// and the actions for those refuse the kind before touching the database.
	...recordPageActions(() => 'product'),

	uploadProductImage: async (event) => {
		const { locals, params, request } = event;
		const { supabase, org, activeOrgId } = locals;
		if (!org || !activeOrgId) return fail(401);
		requirePermission(org.access, RECORD_KIND_META.product.feature, 'manage');

		const form = await superValidate(request, zod4(productImageUploadSchema), {
			id: PRODUCT_IMAGE_FORM_IDS.upload
		});
		if (!form.valid) return fail(400, { form });

		try {
			await setProductImage(supabase, activeOrgId, params.id, form.data.file);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not upload the image.', {
				status: 400
			});
		}
		return { form };
	},

	removeProductImage: async (event) => {
		const { locals, params, request } = event;
		const { supabase, org, activeOrgId } = locals;
		if (!org || !activeOrgId) return fail(401);
		requirePermission(org.access, RECORD_KIND_META.product.feature, 'manage');

		const form = await superValidate(request, zod4(removeProductImageSchema), {
			id: PRODUCT_IMAGE_FORM_IDS.remove
		});
		if (!form.valid) return fail(400, { form });

		try {
			await clearProductImage(supabase, activeOrgId, params.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not remove the image.', {
				status: 400
			});
		}
		return { form };
	}
};
