import { error, redirect } from '@sveltejs/kit';
import { categoryPath, categoryTree, flattenTree } from '$lib/crm/categories';
import { passesFeatureGate } from '$lib/features/gate';
import { QUERY } from '$lib/queries';
import { listProductCategories } from '$lib/server/crm/product-categories';
import { listProducts } from '$lib/server/crm/products';
import { hasGrant } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

/**
 * One category: where it sits in the tree, what is filed directly in it, and
 * what sits under it.
 *
 * A page of its own rather than the generic record page, because a category
 * is not a record kind at all (the categories migration says why): it has no
 * `crm_entity_type` value, so there is no activity, tag, note, custom field
 * or relationship to draw — and what it DOES have, a place in a tree and a
 * shelf of products, the generic page has no idea how to show.
 *
 * Sitting under `/categories` is what gates it: the hook already decides
 * whether this session may open anything under that prefix, so there is no
 * check here. `[id=guid]` keeps a non-uuid off this route.
 *
 * The whole tree is one read (PostgREST cannot embed the self-referencing
 * composite key), so the path, the children and the counts all come from the
 * same rows the tree page uses — and the two can never disagree about what is
 * under what.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	const { supabase, org, activeOrgId } = locals;
	if (!org || !activeOrgId) throw redirect(303, '/login');
	depends(QUERY.categories);
	depends(QUERY.products);

	const [categories, products] = await Promise.all([
		listProductCategories(supabase, activeOrgId),
		listProducts(supabase, activeOrgId, { categoryId: params.id })
	]);

	const category = categories.find((row) => row.id === params.id);
	// RLS hides other orgs' rows, so "missing" and "not yours" are the same
	// 404 — never a 403 that confirms the id is real.
	if (!category) throw error(404, 'Category not found.');

	// Its own node in the folded tree: the children and what the subtree adds
	// up to, without a second walk here.
	const node = flattenTree(categoryTree(categories)).find((n) => n.category.id === params.id);

	// A product links into the catalog only when this reader may open one —
	// the same gate the hook applies to /products.
	const canOpenProducts = passesFeatureGate('/products', org.features, (id) =>
		hasGrant(org.access, id)
	);

	return {
		category,
		// Root first, this category last: the page prints it as the trail.
		path: categoryPath(categories, params.id),
		children: node?.children.map((child) => child.category) ?? [],
		ownProducts: node?.ownProducts ?? 0,
		totalProducts: node?.totalProducts ?? 0,
		products,
		canOpenProducts,
		// The category's name titles the page and names its crumb — the
		// record-title exception in the pages migration.
		title: category.name
	};
};
