import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { QUERY } from '$lib/queries';
import {
	createProductCategory,
	deleteProductCategory,
	listProductCategories,
	updateProductCategory
} from '$lib/server/crm/product-categories';
import {
	createCategorySchema,
	deleteCategorySchema,
	parentOf,
	sortOrderOf,
	updateCategorySchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The catalog tree. Gated by the hook on the `categories` feature + read
 * grant; the whole org's nodes come back in one read and
 * `$lib/crm/categories` nests them.
 *
 * **Managing the tree is owner/admin, and that is the WHOLE answer.** The
 * `product_categories` policies were written that way in the product_catalog
 * migration — a category is reference data like a pipeline, not working data
 * like the products in it. So the feature's levels do not apply here: the
 * grant governs READING (the hook gates the route on it), and no `manage` a
 * member could hold would get past RLS. Asking `can(access, 'categories',
 * 'manage')` as well would read like a second gate while always answering
 * what the role already said — owner and admin bypass grants entirely
 * (`hasGrant()`), so the conjunction reduces to the role every time.
 *
 * That is why there is one flag rather than a manage/delete pair: both acts
 * have the same answer, and a second flag that can never differ is a ladder
 * the database does not have.
 */

const FORM_IDS = {
	create: 'create-category',
	update: 'update-category',
	remove: 'delete-category'
} as const;

/** The org, and whether this session may manage the tree — which is the org role. */
function orgOf(locals: App.Locals) {
	const { org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	return {
		orgId: activeOrgId,
		canManage: org.activeOrg.role === 'owner' || org.activeOrg.role === 'admin'
	};
}

/** The refusal every write opens with, in the words the policy would use. */
function requireManage(locals: App.Locals) {
	const { orgId, canManage } = orgOf(locals);
	if (!canManage) throw error(403, 'Only an owner or an admin can manage the catalog tree.');
	return orgId;
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { supabase } = locals;
	const { orgId, canManage } = orgOf(locals);
	depends(QUERY.categories);
	// The counts on each node are product counts, so a product filed or
	// unfiled changes this page too.
	depends(QUERY.products);

	const [categories, createForm, updateForm, removeForm] = await Promise.all([
		listProductCategories(supabase, orgId),
		superValidate(zod4(createCategorySchema), { id: FORM_IDS.create }),
		superValidate(zod4(updateCategorySchema), { id: FORM_IDS.update }),
		superValidate(zod4(deleteCategorySchema), { id: FORM_IDS.remove })
	]);

	return { categories, canManage, createForm, updateForm, removeForm };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const orgId = requireManage(locals);
		const form = await superValidate(request, zod4(createCategorySchema), { id: FORM_IDS.create });
		if (!form.valid) return fail(400, { form });

		try {
			await createProductCategory(locals.supabase, orgId, {
				name: form.data.name,
				description: form.data.description === '' ? null : form.data.description,
				parent_id: parentOf(form.data.parent_id),
				sort_order: sortOrderOf(form.data.sort_order)
			});
		} catch (cause) {
			// A duplicate name among siblings and a parent from another org are
			// both the database's to refuse; its message belongs in the form.
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not create the category.',
				{ status: 400 }
			);
		}
		return { form };
	},

	update: async ({ request, locals }) => {
		const orgId = requireManage(locals);
		const form = await superValidate(request, zod4(updateCategorySchema), { id: FORM_IDS.update });
		if (!form.valid) return fail(400, { form });

		// Moving a category under itself is refused by a trigger that walks the
		// parents; the page keeps the choice off the picker, and this is the
		// backstop for a post that did not come from the page.
		try {
			await updateProductCategory(locals.supabase, orgId, form.data.id, {
				name: form.data.name,
				description: form.data.description === '' ? null : form.data.description,
				parent_id: parentOf(form.data.parent_id),
				sort_order: sortOrderOf(form.data.sort_order)
			});
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not save the category.',
				{
					status: 400
				}
			);
		}
		return { form };
	},

	remove: async ({ request, locals }) => {
		// Removing takes the whole subtree with it — the same owner/admin
		// answer, because the policy does not distinguish the two acts.
		const orgId = requireManage(locals);
		const form = await superValidate(request, zod4(deleteCategorySchema), { id: FORM_IDS.remove });
		if (!form.valid) return fail(400, { form });

		try {
			await deleteProductCategory(locals.supabase, orgId, form.data.id);
		} catch (cause) {
			return message(
				form,
				cause instanceof Error ? cause.message : 'Could not delete the category.',
				{ status: 400 }
			);
		}
		return { form };
	}
};
