import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listCompanies } from '$lib/server/crm/companies';
import {
	addOrderLine,
	cancelOrder,
	confirmOrder,
	deleteOrderLine,
	getOrder,
	splitOrderLine,
	updateOrderLine
} from '$lib/server/crm/orders';
import { listProducts } from '$lib/server/crm/products';
import { createShipment, listShipments } from '$lib/server/crm/shipments';
import { loadEditRecord, updateRecord } from '$lib/server/records';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import {
	amountOf,
	orderActSchema,
	orderLineSchema,
	pickOf,
	removeOrderLineSchema,
	setLineStatusSchema,
	splitOrderLineSchema,
	updateOrderLineSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One customer order — a page of its own rather than the generic record page.
 *
 * A static segment outranks `[kind=record]`, so this takes over `/orders/
 * <id>` and the generic page stays the default for every other kind (the rule
 * in `$lib/crm/records`). It earns the specific page because an order is a
 * DOCUMENT: most of the screen is its lines, where each of them stands, and
 * the acts that move it — none of which the generic page can draw.
 *
 * Sitting under `/orders` is what gates it: the hook already decides whether
 * this session may open anything under that prefix.
 *
 * **Neither status is on this page's list of things to set.** Confirming and
 * cancelling are acts; the header's `fulfillment_status` is folded from the
 * lines by `refresh_order_fulfillment()`, so a line write is what moves it.
 * And of a LINE's states, `shipped` and `delivered` are the carrier's — they
 * arrive when a scan lands on the shipment carrying the line, so this page
 * offers the other five (`LINE_FULFILLMENT_STATUSES`).
 *
 * **A box is born here**, because `shipments.order_id` is not null and
 * insert-only: there is no "add shipment" button on the shipments list, and
 * "Ship this order" is the one door. It opens an empty `preparing` box on this
 * order; what goes in it is packed on the shipment's own page.
 */

const FORM_IDS = {
	addLine: 'add-order-line',
	updateLine: 'update-order-line',
	removeLine: 'remove-order-line',
	setStatus: 'set-order-line-status',
	splitLine: 'split-order-line',
	ship: 'ship-order',
	confirm: 'confirm-order',
	cancel: 'cancel-order'
} as const;

function orgOf(locals: App.Locals) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { supabase, orgId: activeOrgId, org };
}

/** The guard every write on this page opens with. */
function requireManage(locals: App.Locals) {
	const { supabase, orgId, org } = orgOf(locals);
	requirePermission(org.access, 'orders', 'manage');
	return { supabase, orgId };
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, orgId, org } = orgOf(locals);
	depends(QUERY.orders);
	depends(QUERY.record('order', params.id));

	const canManage = can(org.access, 'orders', 'manage');

	const [
		order,
		products,
		suppliers,
		addLineForm,
		updateLineForm,
		removeLineForm,
		statusForm,
		splitForm,
		shipForm,
		actForm,
		shipments
	] = await Promise.all([
		getOrder(supabase, orgId, params.id),
		// The catalog and the vendor list a line can cite. Only for a writer: a
		// reader never opens the line form, and the action refuses them anyway.
		canManage ? listProducts(supabase, orgId, { activeOnly: true }) : [],
		canManage ? listCompanies(supabase, orgId) : [],
		superValidate(zod4(orderLineSchema), { id: FORM_IDS.addLine }),
		superValidate(zod4(updateOrderLineSchema), { id: FORM_IDS.updateLine }),
		superValidate(zod4(removeOrderLineSchema), { id: FORM_IDS.removeLine }),
		superValidate(zod4(setLineStatusSchema), { id: FORM_IDS.setStatus }),
		superValidate(zod4(splitOrderLineSchema), { id: FORM_IDS.splitLine }),
		superValidate(zod4(orderActSchema), { id: FORM_IDS.ship }),
		superValidate(zod4(orderActSchema), { id: FORM_IDS.confirm }),
		listShipments(supabase, orgId, { orderId: params.id })
	]);

	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	if (!order) throw error(404, 'Order not found.');

	// The header is edited through the same generic form the list page creates
	// with — a kind is described once (`$lib/server/records.ts`).
	const edit = canManage ? await loadEditRecord(locals, 'order', params.id) : null;

	const canOpenParty = passesFeatureGate('/companies', org.features, (id) =>
		hasGrant(org.access, id)
	);

	return {
		order,
		products,
		suppliers,
		canManage,
		// Whether the customer's name links: the same gate the hook applies to
		// /companies, so a link here is never a link to a refusal.
		canOpenParty,
		canOpenContact: passesFeatureGate('/contacts', org.features, (id) => hasGrant(org.access, id)),
		// The acts, decided from the row rather than re-derived in the page.
		canConfirm: canManage && order.status === 'draft',
		canCancel: canManage && order.status !== 'cancelled',
		// Lines freeze once an order is cancelled — the table's own trigger
		// refuses a change, and the page stops offering one. A CONFIRMED order
		// stays editable on purpose: goods have not moved.
		linesEditable: canManage && order.status !== 'cancelled',
		edit,
		addLineForm,
		updateLineForm,
		removeLineForm,
		statusForm,
		splitForm,
		shipForm,
		actForm,
		// The boxes already going out against this order, so the page is the
		// one place that answers "what has left".
		shipments,
		canShip: can(org.access, 'shipments', 'manage'),
		canOpenShipment: passesFeatureGate('/shipments', org.features, (id) =>
			hasGrant(org.access, id)
		),
		// The number titles the page and names its crumb.
		title: order.number
	};
};

export const actions: Actions = {
	/** The header, through the generic registry — `updateRecord()` re-checks `manage`. */
	edit: (event) => updateRecord(event, 'order', event.params.id),

	addLine: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(orderLineSchema), { id: FORM_IDS.addLine });
		if (!form.valid) return fail(400, { form });

		try {
			await addOrderLine(supabase, orgId, params.id, {
				product_id: pickOf(form.data.product_id),
				supplier_id: pickOf(form.data.supplier_id),
				description: form.data.description,
				product_sku_snapshot:
					form.data.product_sku_snapshot === '' ? null : form.data.product_sku_snapshot,
				quantity: Number(form.data.quantity),
				unit_price: amountOf(form.data.unit_price),
				discount: amountOf(form.data.discount),
				tax: amountOf(form.data.tax),
				// Nothing has moved on a line that was just added.
				fulfillment_status: 'pending',
				sort_order: 0
			});
		} catch (cause) {
			// A cancelled order refuses its lines by trigger; that message
			// belongs in the form rather than as a 500.
			return message(form, cause instanceof Error ? cause.message : 'Could not add the line.', {
				status: 400
			});
		}
		return { form };
	},

	updateLine: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(updateOrderLineSchema), {
			id: FORM_IDS.updateLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updateOrderLine(supabase, orgId, form.data.id, {
				product_id: pickOf(form.data.product_id),
				supplier_id: pickOf(form.data.supplier_id),
				description: form.data.description,
				product_sku_snapshot:
					form.data.product_sku_snapshot === '' ? null : form.data.product_sku_snapshot,
				quantity: Number(form.data.quantity),
				unit_price: amountOf(form.data.unit_price),
				discount: amountOf(form.data.discount),
				tax: amountOf(form.data.tax)
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the line.', {
				status: 400
			});
		}
		return { form };
	},

	/**
	 * Where a line stands. Writes ONE column on ONE line; the header's
	 * `fulfillment_status` follows by trigger, which is why this is not paired
	 * with a "fulfil order" act.
	 */
	setLineStatus: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(setLineStatusSchema), {
			id: FORM_IDS.setStatus
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updateOrderLine(supabase, orgId, form.data.id, {
				fulfillment_status: form.data.fulfillment_status
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not move the line.', {
				status: 400
			});
		}
		return { form };
	},

	/**
	 * Splits a line in two — how a partial shipment is expressed, since a
	 * shipment line has no quantity. The typed number is what this line KEEPS;
	 * the rest leaves as a new pending line.
	 */
	splitLine: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(splitOrderLineSchema), {
			id: FORM_IDS.splitLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await splitOrderLine(supabase, orgId, form.data.id, Number(form.data.quantity));
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not split the line.', {
				status: 400
			});
		}
		return { form };
	},

	removeLine: async ({ request, locals }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(removeOrderLineSchema), {
			id: FORM_IDS.removeLine
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteOrderLine(supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not remove the line.', {
				status: 400
			});
		}
		return { form };
	},

	/**
	 * Opens an empty box against this order and goes to it. The one door a
	 * shipment comes through: its `order_id` is not null and insert-only, so
	 * there is nowhere else it could be created from.
	 *
	 * It needs its own grant, not the order's — shipping and taking an order
	 * are different jobs, and a role may hold one without the other.
	 */
	ship: async ({ request, locals, params }) => {
		const { supabase, orgId, org } = orgOf(locals);
		requirePermission(org.access, 'shipments', 'manage');
		const form = await superValidate(request, zod4(orderActSchema), { id: FORM_IDS.ship });

		let shipment;
		try {
			shipment = await createShipment(supabase, orgId, params.id, {
				supplier_id: null,
				carrier: null,
				tracking_number: null,
				tracking_url: null,
				// Ours, not a carrier's: the box exists in the warehouse before
				// anyone has heard of it, and nothing on the order moves yet.
				delivery_status: 'preparing',
				ship_date: null,
				estimated_delivery_date: null,
				shipped_at: null,
				delivered_at: null,
				notes: null
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not open a box.', {
				status: 400
			});
		}
		// Packing is the shipment's own screen, so the act lands there.
		throw redirect(303, `/shipments/${shipment.id}`);
	},

	/** Commits to the order. A draft only — the module scopes the write to one. */
	confirm: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(orderActSchema), { id: FORM_IDS.confirm });

		try {
			await confirmOrder(supabase, orgId, params.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not confirm the order.',
				{
					status: 400
				}
			);
		}
		return { form };
	},

	/** Cancels it. Its lines freeze from here, which the page says before it asks. */
	cancel: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(orderActSchema), { id: FORM_IDS.cancel });

		try {
			await cancelOrder(supabase, orgId, params.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not cancel the order.', {
				status: 400
			});
		}
		return { form };
	}
};
