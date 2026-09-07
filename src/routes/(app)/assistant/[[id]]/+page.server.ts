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
import { isAiConfigured } from '$lib/server/ai/provider';
import { deleteConversationSchema, renameConversationSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The assistant page. One route with an optional id: `/assistant` is a new
 * thread (the load mints its id, the first turn creates the row), and
 * `/assistant/<id>` resumes a stored one. Gated by the hook on the
 * `assistant` feature and the read grant; what the assistant may DO for this
 * user is decided per tool by the agent, not here.
 */

/** Explicit ids, shared by the load, the actions and the page's superForms — see the staff page. */
const FORM_IDS = { rename: 'rename-conversation', delete: 'delete-conversation' } as const;

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

	const [renameForm, deleteForm] = await Promise.all([
		superValidate(zod4(renameConversationSchema), { id: FORM_IDS.rename }),
		superValidate(zod4(deleteConversationSchema), { id: FORM_IDS.delete })
	]);

	const data = {
		conversations,
		conversationId,
		initialMessages,
		/** Off when the server has no provider key: the page says so instead of failing on send. */
		configured: isAiConfigured(),
		renameForm,
		deleteForm
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
	}
};
