import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listCompanies } from '$lib/server/crm/companies';
import {
	getShipment,
	packableLines,
	packLine,
	unpackLine,
	updateShipment,
	logShipmentEvent
} from '$lib/server/crm/shipments';
import { instant } from '$lib/server/records';
import { can, hasGrant, requirePermission } from '$lib/server/roles';
import {
	logEventSchema,
	packLineSchema,
	pickOf,
	setDeliveryStatusSchema,
	shipmentSchema,
	textOf
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * One box — a page of its own rather than the generic record page.
 *
 * A static segment outranks `[kind=record]`, so this takes over `/shipments/
 * <id>` and the generic page stays the default for every other kind. It earns
 * the specific page because a shipment is three things the generic page has no
 * frame for: the order lines inside it, the carrier's scans in order, and the
 * one status write that moves the order.
 *
 * Sitting under `/shipments` is what gates it: the hook already decides
 * whether this session may open anything under that prefix.
 *
 * **`delivery_status` is the write that reaches the order.**
 * `apply_shipment_status_to_lines()` pushes it onto every line in the box,
 * skipping the ones a person already cancelled or returned — so this page
 * never writes an order line itself, and the order's own
 * `fulfillment_status` follows from there.
 *
 * **A packing row cannot be edited**, only added and removed: a line is in
 * the box or it is not, and moving one to a different box is an unpack and a
 * pack. That is also what makes the carrier half restate both shipments'
 * lines correctly.
 */

const FORM_IDS = {
	edit: 'edit-shipment',
	status: 'set-delivery-status',
	pack: 'pack-line',
	unpack: 'unpack-line',
	event: 'log-shipment-event'
} as const;

function orgOf(locals: App.Locals) {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { supabase, orgId: activeOrgId, org };
}

/** The guard every write on this page opens with. */
function requireManage(locals: App.Locals) {
	const { supabase, orgId, org } = orgOf(locals);
	requirePermission(org.access, 'shipments', 'manage');
	return { supabase, orgId };
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, orgId, org } = orgOf(locals);
	depends(QUERY.shipments);
	depends(QUERY.record('shipment', params.id));

	const canManage = can(org.access, 'shipments', 'manage');
	const shipment = await getShipment(supabase, orgId, params.id);

	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	if (!shipment) throw error(404, 'Shipment not found.');

	const [suppliers, packable, editForm, statusForm, packForm, unpackForm, eventForm] =
		await Promise.all([
			// Only for a writer: a reader never opens the form, and the action
			// refuses them anyway.
			canManage ? listCompanies(supabase, orgId) : [],
			// This order's lines that are not already in some box. A line
			// already packed elsewhere is not offered, rather than offered and
			// refused by the unique index.
			canManage ? packableLines(supabase, orgId, shipment.order_id) : [],
			superValidate(shipmentValues(shipment), zod4(shipmentSchema), { id: FORM_IDS.edit }),
			superValidate({ delivery_status: shipment.delivery_status }, zod4(setDeliveryStatusSchema), {
				id: FORM_IDS.status
			}),
			superValidate(zod4(packLineSchema), { id: FORM_IDS.pack }),
			superValidate(zod4(packLineSchema), { id: FORM_IDS.unpack }),
			superValidate(zod4(logEventSchema), { id: FORM_IDS.event })
		]);

	return {
		shipment,
		suppliers,
		packable,
		canManage,
		// Whether the order and the supplier link: the same gates the hook
		// applies to those routes, so a link here is never one to a refusal.
		canOpenOrder: passesFeatureGate('/orders', org.features, (id) => hasGrant(org.access, id)),
		canOpenParty: passesFeatureGate('/companies', org.features, (id) => hasGrant(org.access, id)),
		editForm,
		statusForm,
		packForm,
		unpackForm,
		eventForm,
		// A shipment has no name of its own; the tracking number is what it is
		// known by, and a box not yet handed to a carrier has none.
		title: shipment.tracking_number ?? 'Untracked shipment'
	};
};

/** The row as the edit form's strings — `recordFormValues()`'s job, for this one page's form. */
function shipmentValues(shipment: Awaited<ReturnType<typeof getShipment>> & object) {
	return {
		supplier_id: shipment.supplier_id ?? '',
		carrier: shipment.carrier ?? '',
		tracking_number: shipment.tracking_number ?? '',
		tracking_url: shipment.tracking_url ?? '',
		ship_date: shipment.ship_date ?? '',
		estimated_delivery_date: shipment.estimated_delivery_date ?? '',
		notes: shipment.notes ?? ''
	};
}

export const actions: Actions = {
	edit: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(shipmentSchema), { id: FORM_IDS.edit });
		if (!form.valid) return fail(400, { form });

		try {
			await updateShipment(supabase, orgId, params.id, {
				supplier_id: pickOf(form.data.supplier_id),
				carrier: textOf(form.data.carrier),
				tracking_number: textOf(form.data.tracking_number),
				tracking_url: textOf(form.data.tracking_url),
				ship_date: textOf(form.data.ship_date),
				estimated_delivery_date: textOf(form.data.estimated_delivery_date),
				notes: textOf(form.data.notes)
			});
		} catch (cause) {
			// One carrier and tracking number per org, by unique index — that
			// collision belongs in the form rather than as a 500.
			return message(form, cause instanceof Error ? cause.message : 'Could not save the box.', {
				status: 400
			});
		}
		return { form };
	},

	/**
	 * Where the carrier last saw it — the one write that reaches the order.
	 * `shipped_at` and `delivered_at` are stamped here rather than by trigger
	 * because they are facts about THIS status change, and the schema left
	 * them for the app (a tracking sync writes the same two columns).
	 */
	setStatus: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(setDeliveryStatusSchema), {
			id: FORM_IDS.status
		});
		if (!form.valid) return fail(400, { form });

		const now = new Date().toISOString();
		const status = form.data.delivery_status;
		const columns: Parameters<typeof updateShipment>[3] = { delivery_status: status };
		// The two stamps this status change is a fact about. `in_transit` is
		// when it actually went; `delivered` is when it landed.
		if (status === 'in_transit') columns.shipped_at = now;
		if (status === 'delivered') columns.delivered_at = now;

		try {
			await updateShipment(supabase, orgId, params.id, columns);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not move the box.', {
				status: 400
			});
		}
		return { form };
	},

	pack: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(packLineSchema), { id: FORM_IDS.pack });
		if (!form.valid) return fail(400, { form });

		try {
			await packLine(supabase, orgId, params.id, form.data.order_line_item_id);
		} catch (cause) {
			// One line, one box: the unique index refuses a line already packed
			// somewhere, and that is the message to show.
			return message(form, cause instanceof Error ? cause.message : 'Could not pack the line.', {
				status: 400
			});
		}
		return { form };
	},

	unpack: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(packLineSchema), { id: FORM_IDS.unpack });
		if (!form.valid) return fail(400, { form });

		try {
			await unpackLine(supabase, orgId, params.id, form.data.order_line_item_id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not unpack the line.', {
				status: 400
			});
		}
		return { form };
	},

	/** One scan, typed in. Append-only, so there is no edit or delete beside it. */
	logEvent: async ({ request, locals, params }) => {
		const { supabase, orgId } = requireManage(locals);
		const form = await superValidate(request, zod4(logEventSchema), { id: FORM_IDS.event });
		if (!form.valid) return fail(400, { form });

		// The wall clock the browser showed, back to the instant the column
		// holds — the shared rewrite every date-time field goes through.
		const occurred = instant(form.data.occurred_at);
		if (!occurred) return message(form, 'Say when the carrier reported it.', { status: 400 });

		try {
			await logShipmentEvent(supabase, orgId, params.id, {
				message: form.data.message,
				status: textOf(form.data.status),
				status_detail: null,
				description: null,
				source: 'manual',
				city: textOf(form.data.city),
				region: textOf(form.data.region),
				country: null,
				postal_code: null,
				occurred_at: occurred
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not log the scan.', {
				status: 400
			});
		}
		return { form };
	}
};
