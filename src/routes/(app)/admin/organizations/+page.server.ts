import { listOrganizations } from '$lib/server/admin';
import { requireOperator } from '$lib/server/operator';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = await requireOperator(locals);
	return { organizations: await listOrganizations(db) };
};
