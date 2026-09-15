import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import {
	createFeaturedGroup,
	deleteFeaturedGroup,
	listFeaturedGroups,
	updateFeaturedGroup
} from '$lib/server/crm/featured-groups';
import { listProducts } from '$lib/server/crm/products';
import { can, requirePermission } from '$lib/server/roles';
import {
	createFeaturedGroupSchema,
	deleteFeaturedGroupSchema,
	pickedIds,
	updateFeaturedGroupSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Featured groups — the named sets of products an org puts in front of a
 * buyer together. Gated by the hook on the `featured-groups` feature + read
 * grant; `manage` adds and edits a group, `delete` removes one — the three
 * levels, the way the staff and quick plans pages use them.
 *
 * A group is created and edited here rather than through the generic record
 * form because its one interesting field is a multi-select of products, which
 * that form's one-string-per-field contract cannot render; the page keeps its
 * own superforms forms (schema.ts) and says so, exactly as quick plans does.
 */

/** Explicit form ids, shared by the load, the actions and the page's three `superForm`s. */
const FORM_IDS = {
	create: 'create-featured-group',
	update: 'update-featured-group',
	remove: 'delete-featured-group'
} as const;

function orgOf(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return { orgId: activeOrgId, access: org.access };
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase } = locals;
	const { orgId, access } = orgOf(locals);
	depends(QUERY.featuredGroups);
	depends(QUERY.products);

	const [featuredGroups, products, createForm, updateForm, removeForm] = await Promise.all([
		listFeaturedGroups(supabase, orgId),
		listProducts(supabase, orgId, { activeOnly: true }),
		superValidate(zod4(createFeaturedGroupSchema), { id: FORM_IDS.create }),
		superValidate(zod4(updateFeaturedGroupSchema), { id: FORM_IDS.update }),
		superValidate(zod4(deleteFeaturedGroupSchema), { id: FORM_IDS.remove })
	]);

	return {
		featuredGroups,
		products,
		canManage: can(access, 'featured-groups', 'manage'),
		canDelete: can(access, 'featured-groups', 'delete'),
		createForm,
		updateForm,
		removeForm
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'featured-groups', 'manage');
		const form = await superValidate(request, zod4(createFeaturedGroupSchema), {
			id: FORM_IDS.create
		});
		if (!form.valid) return fail(400, { form });

		try {
			await createFeaturedGroup(
				locals.supabase,
				orgId,
				{
					name: form.data.name,
					description: form.data.description === '' ? null : form.data.description,
					is_active: form.data.is_active === 'true'
				},
				pickedIds(form.data.product_ids)
			);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not create the group.', {
				status: 400
			});
		}
		return { form };
	},

	update: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'featured-groups', 'manage');
		const form = await superValidate(request, zod4(updateFeaturedGroupSchema), {
			id: FORM_IDS.update
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updateFeaturedGroup(
				locals.supabase,
				orgId,
				form.data.id,
				{
					name: form.data.name,
					description: form.data.description === '' ? null : form.data.description,
					is_active: form.data.is_active === 'true'
				},
				pickedIds(form.data.product_ids)
			);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not save the group.', {
				status: 400
			});
		}
		return { form };
	},

	remove: async ({ request, locals }) => {
		const { orgId, access } = orgOf(locals);
		requirePermission(access, 'featured-groups', 'delete');
		const form = await superValidate(request, zod4(deleteFeaturedGroupSchema), {
			id: FORM_IDS.remove
		});
		if (!form.valid) return fail(400, { form });

		try {
			await deleteFeaturedGroup(locals.supabase, orgId, form.data.id);
		} catch (cause) {
			return message(form, cause instanceof Error ? cause.message : 'Could not delete the group.', {
				status: 400
			});
		}
		return { form };
	}
};
