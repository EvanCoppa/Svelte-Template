import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
import { z } from 'zod';
import type { Json } from '$lib/database.types';
import { zod4 } from 'sveltekit-superforms/adapters';
import { RECORD_KIND_META } from '$lib/crm/records';
import { QUERY } from '$lib/queries';
import { listOrderLinesForProduct } from '$lib/server/crm/orders';
import { clearProductImage, getProduct, setProductImage } from '$lib/server/crm/products';
import { listPurchaseLinesForProduct } from '$lib/server/crm/purchases';
import { loadRecordPage, recordGate, recordPageActions } from '$lib/server/record-page';
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
 * It earns the specific page for what the generic page has no frame for: the
 * storefront pictures (`products.image_url`, uploaded into the public
 * `product-images` bucket rather than typed in as a raw URL, and the
 * `additional_images` gallery), and the figures a catalog row is really
 * about — how it sells (the order lines that cite it, folded by
 * `salesSummary()` in `$lib/crm/products`), how much of it is left (on hand
 * less what confirmed orders have not shipped), and who it is bought from
 * (the purchase lines). Each of those is gated by the feature it reads,
 * exactly as a related group is: no `orders` grant, no sales figures and no
 * Orders tab. Everything else a record page shows — the header, the tabs,
 * the rail, the generic edit form — stays `$lib/server/record-page.ts`,
 * composed rather than copied.
 */

const PRODUCT_IMAGE_FORM_IDS = {
	upload: 'product-image',
	remove: 'remove-product-image'
} as const;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');

	const { canOpen } = recordGate(org);
	const ordersShown = canOpen('order');
	const purchasesShown = canOpen('purchase');
	// A line lands on an order or a purchase elsewhere; the figures here
	// follow the same keys those pages refresh on.
	if (ordersShown) depends(QUERY.orders);
	if (purchasesShown) depends(QUERY.purchases);

	// The raw columns the generic `RecordDetail` fields never carry — read
	// again here rather than added to `describeProduct()`, which draws the
	// rail's field list, not this page's pictures and stock.
	const [shell, product, orderLines, purchaseLines, imageForm, removeImageForm] = await Promise.all(
		[
			loadRecordPage(locals, 'product', params.id, depends),
			getProduct(supabase, activeOrgId, params.id),
			ordersShown ? listOrderLinesForProduct(supabase, activeOrgId, params.id) : null,
			purchasesShown ? listPurchaseLinesForProduct(supabase, activeOrgId, params.id) : null,
			superValidate(zod4(productImageUploadSchema), { id: PRODUCT_IMAGE_FORM_IDS.upload }),
			superValidate(zod4(removeProductImageSchema), { id: PRODUCT_IMAGE_FORM_IDS.remove })
		]
	);
	// The shell already answered 404 for a missing row; this is the type's, not a second read.
	if (!product) error(404, 'Product not found.');

	return {
		...shell,
		product: {
			kind: product.kind,
			sku: product.sku,
			description: product.description,
			longDescription: product.long_description,
			imageUrl: product.image_url,
			gallery: galleryUrls(product.additional_images),
			currency: product.currency,
			unitPrice: product.unit_price,
			unitCost: product.unit_cost,
			msrp: product.msrp,
			unit: product.unit,
			trackInventory: product.track_inventory,
			quantityOnHand: product.quantity_on_hand,
			isActive: product.is_active
		},
		/** Null when this session may not open orders, so the page draws no figures rather than zeros. */
		orderLines,
		purchaseLines,
		imageForm,
		removeImageForm
	};
};

/** The gallery column is a JSON array of URLs; a column holding anything else has no pictures in it. */
const gallerySchema = z.array(z.url({ protocol: /^https?$/ })).catch([]);

function galleryUrls(value: Json): string[] {
	return gallerySchema.parse(value);
}

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
		// `form.data.file` is a `File`, which devalue cannot serialise — an
		// action returning one answers 500 however well the upload went. Every
		// exit that carries this form goes through `withFiles()`, which drops
		// it; `message()` already does the same on its own.
		if (!form.valid) return fail(400, withFiles({ form }));

		try {
			await setProductImage(supabase, activeOrgId, params.id, form.data.file);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not upload the image.', {
				status: 400
			});
		}
		return withFiles({ form });
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
