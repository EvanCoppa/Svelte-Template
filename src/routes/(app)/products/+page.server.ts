import { redirect } from '@sveltejs/kit';
import { QUERY } from '$lib/queries';
import { listProducts } from '$lib/server/crm/products';
import type { PageServerLoad } from './$types';

// Gated by the hook on the `products` feature + read grant; see companies.
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.activeOrgId) throw redirect(303, '/login');
	depends(QUERY.products);

	return { products: await listProducts(locals.supabase, locals.activeOrgId) };
};
