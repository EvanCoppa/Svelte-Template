import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import { listBillables } from '$lib/server/crm/billables';
import {
	createQuickPlan,
	deleteQuickPlan,
	listQuickPlans,
	updateQuickPlan
} from '$lib/server/crm/quick-plans';
import { can, requirePermission } from '$lib/server/roles';
import {
	createQuickPlanSchema,
	deleteQuickPlanSchema,
	pickedIds,
	updateQuickPlanSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Quick plans — the bundles of billables the proposal builder's "Quick
 * Select" chips apply. Gated by the hook on the `quick-plans` feature + read
 * grant; `manage` adds and edits a bundle, `delete` removes one — the three
 * levels, the way the staff page uses them.
 *
 * A bundle is created and edited here rather than through the generic record
 * form because its one interesting field is a multi-select of billables,
 * which that form's one-string-per-field contract cannot render; the page
 * keeps its own superforms forms (schema.ts) and says so, like the staff
 * page's invite.
 */

/** Explicit form ids, shared by the load, the actions and the page's three `superForm`s. */
const FORM_IDS = {
	create: 'create-quick-plan',
	update: 'update-quick-plan',
	remove: 'delete-quick-plan'
} as const;

function orgOf(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { orgId: activeOrgId, access: org.access };
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase } = locals;
	const { orgId, access } = orgOf(locals);
	depends(QUERY.quickPlans);
	depends(QUERY.billables);

	const [quickPlans, billables, createForm, updateForm, removeForm] = await Promise.all([
		listQuickPlans(supabase, orgId),
		listBillables(supabase, orgId, { activeOnly: true }),
		superValidate(zod4(createQuickPlanSchema), { id: FORM_IDS.create }),
		superValidate(zod4(updateQuickPlanSchema), { id: FORM_IDS.update }),
		superValidate(zod4(deleteQuickPlanSchema), { id: FORM_IDS.remove })
	]);

	return {
		quickPlans,
		billables,
		canManage: can(access, 'quick-plans', 'manage'),
		canDelete: can(access, 'quick-plans', 'delete'),
		createForm,
		updateForm,
		removeForm
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'quick-plans', 'manage');
		const form = await superValidate(request, zod4(createQuickPlanSchema), { id: FORM_IDS.create });
		if (!form.valid) return fail(400, { form });

		try {
			await createQuickPlan(
				locals.supabase,
				orgId,
				{ name: form.data.name },
				pickedIds(form.data.billable_ids)
			);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not create the bundle.',
				{
					status: 400
				}
			);
		}
		return { form };
	},

	update: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'quick-plans', 'manage');
		const form = await superValidate(request, zod4(updateQuickPlanSchema), { id: FORM_IDS.update });
		if (!form.valid) return fail(400, { form });

		try {
			await updateQuickPlan(
				locals.supabase,
				orgId,
				form.data.id,
				{ name: form.data.name },
				pickedIds(form.data.billable_ids)
			);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the bundle.', {
				status: 400
			});
		}
		return { form };
	},

	remove: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'quick-plans', 'delete');
		const form = await superValidate(request, zod4(deleteQuickPlanSchema), { id: FORM_IDS.remove });
		if (!form.valid) return fail(400, { form });

		try {
			await deleteQuickPlan(locals.supabase, orgId, form.data.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not delete the bundle.',
				{
					status: 400
				}
			);
		}
		return { form };
	}
};
