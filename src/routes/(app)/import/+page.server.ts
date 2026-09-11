import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	IMPORT_FORM_IDS as FORM_IDS,
	importCommitSchema,
	importUploadSchema,
	type ImportKind
} from '$lib/schemas/imports';
import { RECORD_FORMS } from '$lib/schemas/records';
import { commitImport, importableKinds, previewImport } from '$lib/server/imports';
import { requirePermission } from '$lib/server/roles';
import { SpreadsheetError } from '$lib/server/spreadsheet';
import type { Actions, PageServerLoad } from './$types';

/**
 * The import page: pick a kind, drop a file, review every row, then write
 * the ones you approve (docs/imports.md). Gated by the hook on the
 * `imports` feature; importing a KIND needs `manage` on that kind's
 * feature, which both actions check — the same grant adding one record
 * takes, because that is what an import is.
 *
 * Two forms, two actions. `preview` posts the file and answers with the
 * preview beside the form; nothing is written. `commit` posts the rows
 * back as JSON with a decision on each and answers with what happened.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const { org } = locals;
	if (!org) throw redirect(303, '/login');

	const kinds = importableKinds(org.features, org.access);
	// `?kind=product` opens on a kind — a link from elsewhere can start the import.
	const wanted = url.searchParams.get('kind');
	const initial = kinds.find((kind) => kind === wanted) ?? kinds[0];

	const [uploadForm, commitForm] = await Promise.all([
		superValidate(initial ? { kind: initial } : {}, zod4(importUploadSchema), {
			id: FORM_IDS.upload,
			errors: false
		}),
		superValidate(zod4(importCommitSchema), { id: FORM_IDS.commit })
	]);
	return { kinds, uploadForm, commitForm };
};

/** The action's share of the gate: the org has the kind's feature on, and the user may write it. */
function requireImportable(locals: App.Locals, kind: ImportKind) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	const feature = RECORD_FORMS[kind].feature;
	if (org.features[feature]?.mode !== 'enabled') {
		throw error(404, `The ${feature} feature is not available to this organization.`);
	}
	requirePermission(org.access, feature, 'manage');
	return { supabase: locals.supabase, orgId: activeOrgId };
}

// `satisfies` rather than `: Actions`: the page reads the preview and the
// result off its `form` prop, which only a return type Kit can see gives it.
export const actions = {
	preview: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(importUploadSchema), {
			id: FORM_IDS.upload,
			allowFiles: true
		});
		if (!form.valid) return fail(400, withFiles({ form }));

		const { supabase, orgId } = requireImportable(locals, form.data.kind);
		try {
			const preview = await previewImport(supabase, orgId, form.data.kind, form.data.file);
			return withFiles({ form, preview });
		} catch (cause) {
			// A file that is not a spreadsheet, or too big a one, is the reader's to
			// fix; anything else (a failed read of the org's rows) is a 500. Set on
			// the form and failed, rather than `message()`: its `{ form }` success
			// shape would swallow the `{ form, preview }` one in the action's type.
			if (cause instanceof SpreadsheetError) {
				form.message = cause.message;
				return fail(400, withFiles({ form }));
			}
			throw cause;
		}
	},

	commit: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(importCommitSchema), { id: FORM_IDS.commit });
		if (!form.valid) return fail(400, { form });

		const { supabase, orgId } = requireImportable(locals, form.data.kind);
		const result = await commitImport(supabase, orgId, form.data.kind, form.data.rows);
		return { form, result };
	}
} satisfies Actions;
