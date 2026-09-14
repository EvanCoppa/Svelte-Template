import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { AssistantUIMessage } from '$lib/ai/types';
import { QUERY } from '$lib/queries';
import {
	deleteConversation,
	getConversation,
	listConversations,
	loadMessages,
	updateConversationTitle
} from '$lib/server/ai/conversations';
import { toUIMessages } from '$lib/server/ai/messages';
import { isAiConfigured, realtimeModelId } from '$lib/server/ai/provider';
import { createCalendarEvent } from '$lib/server/crm/calendar';
import { splitOrderLine, type OrderLineItem } from '$lib/server/crm/orders';
import { createShipment, packableLines, packLine } from '$lib/server/crm/shipments';
import { instant } from '$lib/server/records';
import { requirePermission } from '$lib/server/roles';
import {
	bookSlotSchema,
	deleteConversationSchema,
	packOrderSchema,
	renameConversationSchema
} from '$lib/schemas/assistant';
import type { Actions, PageServerLoad } from './$types';

/**
 * The assistant page. One route with an optional id: `/assistant` is a new
 * thread (the load mints its id, the first turn creates the row), and
 * `/assistant/<id>` resumes a stored one. Gated by the hook on the
 * `assistant` feature and the read grant; what the assistant may DO for this
 * user is decided per tool by the agent, not here.
 *
 * Two of its actions are an artifact's. A slot picked on the pick-a-time
 * card and a box packed on the packing card are mutations born in a gesture
 * on this page, so they are form actions here (the calendar's drag-to-move
 * rule) — each opening with the grant the same act takes on its own page:
 * `book` is the calendar's `manage`, `pack` the shipments' (the order page's
 * "Ship this order") plus the order's, since a partial pack splits a line.
 */

/** Explicit ids, shared by the load, the actions and the page's superForms — see the staff page. */
const FORM_IDS = {
	rename: 'rename-conversation',
	delete: 'delete-conversation',
	book: 'book-slot',
	pack: 'pack-order'
} as const;

function orgOf(locals: App.Locals) {
	const { supabase, user, org, activeOrgId } = locals;
	if (!user || !org || !activeOrgId) throw redirect(303, '/login');
	return { supabase, user, org, orgId: activeOrgId };
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, user, activeOrgId } = locals;
	if (!user || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.assistant);

	const conversations = await listConversations(supabase, activeOrgId, user.id);

	let conversationId = params.id;
	let initialMessages: AssistantUIMessage[] = [];
	let title: string | null = null;
	if (conversationId) {
		// RLS hides other members' threads, so "missing" and "not yours" are the
		// same 404 — never a 403 that confirms the id is real.
		const conversation = await getConversation(supabase, activeOrgId, conversationId);
		if (!conversation) throw error(404, 'Conversation not found.');
		initialMessages = await toUIMessages(await loadMessages(supabase, conversationId));
		title = conversation.title;
	} else {
		// Minted here, on the server, so the server render and the hydrated
		// page agree on the id the first turn will be saved under.
		conversationId = crypto.randomUUID();
	}

	const [renameForm, deleteForm, bookForm, packForm] = await Promise.all([
		superValidate(zod4(renameConversationSchema), { id: FORM_IDS.rename }),
		superValidate(zod4(deleteConversationSchema), { id: FORM_IDS.delete }),
		superValidate(zod4(bookSlotSchema), { id: FORM_IDS.book }),
		superValidate(zod4(packOrderSchema), { id: FORM_IDS.pack })
	]);

	const data = {
		conversations,
		conversationId,
		initialMessages,
		/** Off when the server has no provider key: the page says so instead of failing on send. */
		configured: isAiConfigured(),
		/**
		 * Which realtime model a voice call opens with. The browser needs it
		 * before it connects — the session names the model in the update it
		 * sends — and which model that is stays the server's decision.
		 */
		voiceModel: realtimeModelId(),
		renameForm,
		deleteForm,
		bookForm,
		packForm
	};
	// A thread's title names the page (the record-title exception); an
	// untitled or new thread falls back to the registry's "Assistant".
	return title ? { ...data, title } : data;
};

export const actions: Actions = {
	rename: async ({ request, locals }) => {
		const { supabase, user, activeOrgId } = locals;
		if (!user || !activeOrgId) throw redirect(303, '/login');
		const form = await superValidate(request, zod4(renameConversationSchema), {
			id: FORM_IDS.rename
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updateConversationTitle(
				supabase,
				activeOrgId,
				form.data.conversation_id,
				form.data.title
			);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not rename the thread.', {
				status: 400
			});
		}
		return { form };
	},

	delete: async ({ request, locals, params }) => {
		const { supabase, user, activeOrgId } = locals;
		if (!user || !activeOrgId) throw redirect(303, '/login');
		const form = await superValidate(request, zod4(deleteConversationSchema), {
			id: FORM_IDS.delete
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteConversation(supabase, activeOrgId, form.data.conversation_id);
		} catch (err) {
			return message(form, err instanceof Error ? err.message : 'Could not delete the thread.', {
				status: 400
			});
		}
		// Deleting the thread on screen leaves nothing to show; start a new one.
		if (params.id === form.data.conversation_id) throw redirect(303, '/assistant');
		return { form };
	},

	/**
	 * A slot picked on the pick-a-time card becomes a calendar event: timed,
	 * in the default colour, for nobody in particular — the calendar's own
	 * form is where the rest is set, and the event is there to open.
	 */
	book: async ({ request, locals }) => {
		const { supabase, org, orgId } = orgOf(locals);
		requirePermission(org.access, 'calendar', 'manage');
		const form = await superValidate(request, zod4(bookSlotSchema), { id: FORM_IDS.book });
		if (!form.valid) return fail(400, { form });

		try {
			await createCalendarEvent(supabase, orgId, {
				title: form.data.title,
				description: null,
				location: null,
				starts_at: instant(form.data.starts_at) ?? form.data.starts_at,
				ends_at: instant(form.data.ends_at) ?? form.data.ends_at,
				all_day: false,
				color: 'info',
				assigned_to: null,
				entity_type: null,
				entity_id: null
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not book the slot.', {
				status: 400
			});
		}
		return { form };
	},

	/**
	 * Lines ticked on the packing card become a box: a `preparing` shipment
	 * on the order with each line packed into it, a line shipping less than
	 * its quantity split first so the remainder stays on the order as its own
	 * pending line. Only lines in no box yet are accepted — the same set the
	 * card was drawn from — so a line packed elsewhere since is a refusal,
	 * not a second answer to "where is my item".
	 */
	pack: async ({ request, locals }) => {
		const { supabase, org, orgId } = orgOf(locals);
		requirePermission(org.access, 'shipments', 'manage');
		requirePermission(org.access, 'orders', 'manage');
		const form = await superValidate(request, zod4(packOrderSchema), { id: FORM_IDS.pack });
		if (!form.valid) return fail(400, { form });

		// What each posted line is, and how much of it ships — checked before
		// anything is written, so a bad quantity refuses the whole box.
		const packable = new Map(
			(await packableLines(supabase, orgId, form.data.order_id)).map((line) => [line.id, line])
		);
		const packing: { line: OrderLineItem; quantity: number }[] = [];
		for (const posted of form.data.lines) {
			const line = packable.get(posted.id);
			if (!line) {
				return message(form, 'A line is already in a box. Reload and try again.', { status: 400 });
			}
			const quantity = Number(posted.quantity);
			if (quantity <= 0 || quantity > line.quantity) {
				return message(form, `Ship between 1 and ${line.quantity} of “${line.description}”.`, {
					status: 400
				});
			}
			packing.push({ line, quantity });
		}

		let shipmentId: string;
		try {
			const shipment = await createShipment(supabase, orgId, form.data.order_id, {
				supplier_id: null,
				carrier: null,
				tracking_number: null,
				tracking_url: null,
				delivery_status: 'preparing',
				ship_date: null,
				estimated_delivery_date: null,
				shipped_at: null,
				delivered_at: null,
				notes: null
			});
			shipmentId = shipment.id;
			for (const { line, quantity } of packing) {
				if (quantity < line.quantity) await splitOrderLine(supabase, orgId, line.id, quantity);
				await packLine(supabase, orgId, shipmentId, line.id);
			}
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not open a box.', {
				status: 400
			});
		}
		return { form, shipmentId };
	}
};
