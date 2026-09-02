import { redirect } from '@sveltejs/kit';
import { requireOperator } from '$lib/server/operator';
import type { PageServerLoad } from './$types';

/** `/admin` itself is just the front door; the first section is the console. */
export const load: PageServerLoad = async ({ locals }) => {
	await requireOperator(locals);
	throw redirect(303, '/admin/features');
};
