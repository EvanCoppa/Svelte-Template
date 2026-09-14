import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { documentBody, documentTitle } from '$lib/crm/documents';
import { recordTerms } from '$lib/crm/records';
import { visibleTerms } from '$lib/features/terms';
import { QUERY } from '$lib/queries';
import { documentSaveSchema, parseDocumentBody } from '$lib/schemas/documents';
import { getDocument } from '$lib/server/crm/documents';
import { saveDocument } from '$lib/server/crm/references';
import { recordGate } from '$lib/server/record-page';
import { requirePermission } from '$lib/server/roles';
import { hasGrant } from '$lib/server/roles';
import { capitalize } from '$lib/utils.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * One page, open in its editor.
 *
 * A static segment outranks `[kind=record]`, so this takes over
 * `/documents/<id>` and the generic record page stays the default for every
 * other kind. It earns the specific page for the simplest possible reason: a
 * document IS its body, and the generic page's header-tabs-and-rail has no
 * frame for one. There is nothing here the generic page could have drawn.
 *
 * Sitting under `/documents` is what gates it — the hook already decided
 * whether this session may open anything under that prefix — so there is no
 * feature check in this load, only the `manage` check on the write.
 *
 * The page has no `pages` row: its title is the document's name, which is the
 * record-page exception (CLAUDE.md, "A feature is made of pages").
 */

/** One superforms id, like every other single-form page. */
const SAVE_FORM_ID = 'document-save';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.documents);

	const { canRead } = recordGate(org);
	const { noun } = recordTerms(visibleTerms(org.features, canRead), 'document');

	const document = await getDocument(supabase, activeOrgId, params.id);
	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	if (!document) throw error(404, `${capitalize(noun)} not found.`);

	const form = await superValidate(
		{
			title: document.title,
			icon: document.icon ?? '',
			body: JSON.stringify(documentBody(document.body))
		},
		zod4(documentSaveSchema),
		{ id: SAVE_FORM_ID, errors: false }
	);

	return {
		form,
		document: {
			id: document.id,
			title: document.title,
			icon: document.icon,
			body: documentBody(document.body),
			updatedAt: document.updated_at
		},
		// The page's own title, since it has no `pages` row: page data wins.
		title: documentTitle(document),
		canEdit: hasGrant(org.access, 'documents', 'manage')
	};
};

export const actions: Actions = {
	/**
	 * The editor's autosave. A form action, not a `fetch` — the mutation is
	 * born in a gesture on the page it lives on, so it goes through a hidden
	 * form filled from script and submitted with `requestSubmit()` (the
	 * calendar's drag-to-move road).
	 */
	save: async ({ request, locals, params }) => {
		const { supabase, org, activeOrgId } = locals;
		if (!org || !activeOrgId) throw redirect(303, '/login');
		requirePermission(org.access, 'documents', 'manage');

		const form = await superValidate(request, zod4(documentSaveSchema), { id: SAVE_FORM_ID });
		if (!form.valid) return fail(400, { form });

		const body = parseDocumentBody(form.data.body);
		// The browser is the only holder of this writing right now, so an
		// unreadable body is a message to fix it by, never a throw that loses it.
		if (!body)
			return message(form, 'This page could not be read, so nothing was saved.', {
				status: 400
			});

		try {
			// Through `saveDocument()` rather than `updateDocument()`, because
			// that is the one place a body and its reference index are written
			// together — see $lib/server/crm/references.ts.
			await saveDocument(supabase, activeOrgId, params.id, {
				title: form.data.title,
				icon: form.data.icon === '' ? null : form.data.icon,
				body
			});
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'This page was not saved.', {
				status: 400
			});
		}

		return { form };
	}
};
