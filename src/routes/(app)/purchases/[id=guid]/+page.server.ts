import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listProducts } from '$lib/server/crm/products';
import {
	addPurchaseLine,
	cancelPurchase,
	deletePurchaseLine,
	getPurchase,
	placePurchase,
	updatePurchaseLine
} from '$lib/server/crm/purchases';
import { loadEditRecord, updateRecord } from '$lib/server/records';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import {
	amountOf,
	productOf,
	purchaseActSchema,
	purchaseLineSchema,
	receivePurchaseLineSchema,
	removePurchaseLineSchema,
	updatePurchaseLineSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One purchase order — a page of its own rather than the generic record page.
 *
 * A static segment outranks `[kind=record]`, so this takes over `/purchases/
 * <id>` and the generic page stays the default for every other kind (the rule
 * in `$lib/crm/records`). It earns the specific page because a purchase is a
 * DOCUMENT: most of the screen is its lines, what has arrived against each,
 * and the two acts that move it — none of which the generic page can draw.
 *
 * Sitting under `/purchases` is what gates it: the hook already decides
 * whether this session may open anything under that prefix.
 *
 * **The status is not on this page's list of things to set.** Placing and
 * cancelling are acts; `ordered` → `partially_received` → `received` is
 * derived by `refresh_purchase_rollups()` from what has been received, so the
 * receive form writes a line and the header follows. Writing a status here
 * would be overwritten by the next line change.
 */

const FORM_IDS = {
	addLine: 'add-purchase-line',
	updateLine: 'update-purchase-line',
	removeLine: 'remove-purchase-line',
	receiveLine: 'receive-purchase-line',
	place: 'place-purchase',
	cancel: 'cancel-purchase'
} as const;

function orgOf(locals: App.Locals) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { supabase, orgId: activeOrgId, org };
}

/** The guard every write on this page opens with. */
function requireManage(locals: App.Locals) {
	const { supabase, orgId, org } = orgOf(locals);
	requirePermission(org.access, 'purchases', 'manage');
	return { supabase, orgId };
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, orgId, org } = orgOf(locals);
	depends(QUERY.purchases);
	depends(QUERY.record('purchase', params.id));

	const canManage = can(org.access, 'purchases', 'manage');

	const [purchase, products, addLineForm, updateLineForm, removeLineForm, receiveForm, actForm] =
		await Promise.all([
			getPurchase(supabase, orgId, params.id),
			// The catalog a line can cite. Only for a writer: a reader never
			// opens the line form, and the action refuses them anyway.
			canManage ? listProducts(supabase, orgId, { activeOnly: true }) : [],
			superValidate(zod4(purchaseLineSchema), { id: FORM_IDS.addLine }),
			superValidate(zod4(updatePurchaseLineSchema), { id: FORM_IDS.updateLine }),
			superValidate(zod4(removePurchaseLineSchema), { id: FORM_IDS.removeLine }),
			superValidate(zod4(receivePurchaseLineSchema), { id: FORM_IDS.receiveLine }),
			superValidate(zod4(purchaseActSchema), { id: FORM_IDS.place })
		]);

	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	if (!purchase) throw error(404, 'Purchase not found.');

	// The header is edited through the same generic form the list page creates
	// with — a kind is described once (`$lib/server/records.ts`).
	const edit = canManage ? await loadEditRecord(locals, 'purchase', params.id) : null;

	return {
		purchase,
		products,
		canManage,
		// Whether the vendor's name links: the same gate the hook applies to
		// /companies, so a link here is never a link to a refusal.
		canOpenVendor: passesFeatureGate('/companies', org.features, (id) => hasGrant(org.access, id)),
		// The acts, decided from the row rather than re-derived in the page.
		canPlace: canManage && purchase.status === 'draft',
		canCancel: canManage && purchase.status !== 'cancelled',
		// Lines freeze once a purchase is cancelled — the table's own trigger
		// refuses a change, and the page stops offering one.
		linesEditable: canManage && purchase.status !== 'cancelled',
		edit,
		addLineForm,
		updateLineForm,
		removeLineForm,
		receiveForm,
		actForm,
		// The number titles the page and names its crumb.
		title: purchase.number
	};
};

export const actions: Actions = {
	/** The header, through the generic registry — `updateRecord()` re-checks `manage`. */
	edit: (event) => updateRecord(event, 'purchase', event.params.id),

	addLine: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(purchaseLineSchema), { id: FORM_IDS.addLine });
		if (!form.valid) return fail(400, { form });

		try {
			await addPurchaseLine(supabase, orgId, params.id, {
				product_id: productOf(form.data.product_id),
				description: form.data.description,
				product_sku_snapshot:
					form.data.product_sku_snapshot === '' ? null : form.data.product_sku_snapshot,
				quantity_ordered: Number(form.data.quantity_ordered),
				// Nothing has arrived on a line that was just added.
				quantity_received: 0,
				unit_cost: amountOf(form.data.unit_cost),
				freight_allocation: amountOf(form.data.freight_allocation),
				sort_order: 0
			});
		} catch (cause) {
			// A cancelled purchase refuses its lines by trigger; that message
			// belongs in the form rather than as a 500.
			return message(form, cause instanceof Error ? cause.message : 'Could not add the line.', {
				status: 400
			});
		}
		return { form };
	},

	updateLine: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(updatePurchaseLineSchema), {
			id: FORM_IDS.updateLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updatePurchaseLine(supabase, orgId, form.data.id, {
				product_id: productOf(form.data.product_id),
				description: form.data.description,
				product_sku_snapshot:
					form.data.product_sku_snapshot === '' ? null : form.data.product_sku_snapshot,
				quantity_ordered: Number(form.data.quantity_ordered),
				unit_cost: amountOf(form.data.unit_cost),
				freight_allocation: amountOf(form.data.freight_allocation)
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the line.', {
				status: 400
			});
		}
		return { form };
	},

	/**
	 * Receiving stock. Writes ONE column on ONE line; the header's status and
	 * its `received_at` follow by trigger, which is why this is not paired
	 * with a "receive purchase" act.
	 */
	receiveLine: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(receivePurchaseLineSchema), {
			id: FORM_IDS.receiveLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updatePurchaseLine(supabase, orgId, form.data.id, {
				quantity_received: Number(form.data.quantity_received)
			});
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not record what arrived.',
				{
					status: 400
				}
			);
		}
		return { form };
	},

	removeLine: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(removePurchaseLineSchema), {
			id: FORM_IDS.removeLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deletePurchaseLine(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not remove the line.', {
				status: 400
			});
		}
		return { form };
	},

	/** Places the order. A draft only — the module scopes the write to one. */
	place: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(purchaseActSchema), { id: FORM_IDS.place });

		try {
			await placePurchase(supabase, orgId, params.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not place the order.', {
				status: 400
			});
		}
		return { form };
	},

	/** Cancels it. Its lines freeze from here, which the page says before it asks. */
	cancel: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(purchaseActSchema), { id: FORM_IDS.cancel });

		try {
			await cancelPurchase(supabase, orgId, params.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not cancel the order.', {
				status: 400
			});
		}
		return { form };
	}
};
