import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { recordListHref, type RecordKind } from '$lib/crm/records';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { recordLinks } from '$lib/server/crm/links';
import {
	createNoteCategory,
	deleteNoteCategory,
	listNoteCategories,
	updateNoteCategory
} from '$lib/server/crm/note-categories';
import { listNotes } from '$lib/server/crm/notes';
import { loadVocabulary } from '$lib/server/features';
import { noteAccess } from '$lib/server/notes';
import { hasGrant, requirePermission } from '$lib/server/roles';
import { createCategorySchema, deleteCategorySchema, updateCategorySchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every note in one window, filed on the shelves the org made — the screen
 * `⌥⌘L` and the dock's "open every note" lead to. The dock carries the open
 * notes for the shell; this load takes the archive as well, because searching
 * is the reason to be here and an archived note is exactly what you come
 * looking for.
 *
 * Gated by the hook on the `notes` feature + the read grant, like every other
 * list page. A note is still written through `/api/notes` from whichever
 * surface is showing it (see `$lib/notes`) — filing one included, since filing
 * is editing it. What IS an action here is the shelf itself: a category is
 * edited from this page, out of a form, so it takes the ordinary road.
 */

/** Explicit form ids, shared by the load, the actions and the page's `superForm`s. */
const FORM_IDS = {
	createCategory: 'create-category',
	updateCategory: 'update-category',
	deleteCategory: 'delete-category'
} as const;

function orgOf(locals: App.Locals) {
	const { org, activeOrgId, user } = locals;
	if (!org || !activeOrgId || !user) throw redirect(303, '/login');
	return { org, orgId: activeOrgId, user };
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase } = locals;
	const { org, orgId, user } = orgOf(locals);
	depends(QUERY.notes);
	depends(QUERY.noteCategories);

	// The same question the record page asks before it links to another kind.
	const canRead = (featureId: string) => hasGrant(org.access, featureId);
	const canOpen = (kind: RecordKind) =>
		passesFeatureGate(recordListHref(kind), org.features, canRead);

	const notes = await listNotes(supabase, orgId);
	// The words a record's labels use, which is what names the record a note
	// points at — the same vocabulary the record page resolves.
	const vocabulary = await loadVocabulary(supabase, org.activeOrg.industryId);

	return {
		notes,
		categories: await listNoteCategories(supabase, orgId),
		links: await recordLinks(supabase, orgId, notes, canOpen, vocabulary),
		access: noteAccess(org, user.id),
		createCategoryForm: await superValidate(zod4(createCategorySchema), {
			id: FORM_IDS.createCategory
		}),
		updateCategoryForm: await superValidate(zod4(updateCategorySchema), {
			id: FORM_IDS.updateCategory
		}),
		deleteCategoryForm: await superValidate(zod4(deleteCategorySchema), {
			id: FORM_IDS.deleteCategory
		})
	};
};

export const actions: Actions = {
	/**
	 * A new shelf. `manage` on notes, the same level writing one takes — if
	 * you can write a note you can decide what pile it goes in.
	 */
	createCategory: async ({ request, locals }) => {
		const { org, orgId } = orgOf(locals);
		requirePermission(org.access, 'notes', 'manage');

		const form = await superValidate(request, zod4(createCategorySchema), {
			id: FORM_IDS.createCategory
		});
		if (!form.valid) return fail(400, { form });

		try {
			await createNoteCategory(locals.supabase, orgId, {
				name: form.data.name,
				color: form.data.color
			});
		} catch (cause) {
			// The unique index on (org_id, lower(name)) is the common refusal:
			// somebody already made this shelf.
			return message(form, refusal(cause, 'That category could not be added.'), { status: 400 });
		}
		return { form };
	},

	updateCategory: async ({ request, locals }) => {
		const { org, orgId } = orgOf(locals);
		requirePermission(org.access, 'notes', 'manage');

		const form = await superValidate(request, zod4(updateCategorySchema), {
			id: FORM_IDS.updateCategory
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updateNoteCategory(locals.supabase, orgId, form.data.id, {
				name: form.data.name,
				color: form.data.color
			});
		} catch (cause) {
			return message(form, refusal(cause, 'That category could not be saved.'), { status: 400 });
		}
		return { form };
	},

	/**
	 * Removing a shelf, which takes `delete` — and RLS narrows it again to an
	 * owner or admin. The notes on it are unfiled, not deleted.
	 */
	deleteCategory: async ({ request, locals }) => {
		const { org, orgId } = orgOf(locals);
		requirePermission(org.access, 'notes', 'delete');

		const form = await superValidate(request, zod4(deleteCategorySchema), {
			id: FORM_IDS.deleteCategory
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteNoteCategory(locals.supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, refusal(cause, 'That category could not be deleted.'), { status: 400 });
		}
		return { form };
	}
};

/** A refused write is the caller's to fix, so it keeps its own sentence. */
function refusal(cause: unknown, fallback: string): string {
	if (!(cause instanceof Error)) return fallback;
	return cause.message.includes('note_categories_org_id_name_idx')
		? 'There is already a category with that name.'
		: cause.message;
}
