import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST-only, so a prefetched or crawled link can never sign the user out.
export const POST: RequestHandler = async ({ locals: { supabase } }) => {
	await supabase.auth.signOut();
	throw redirect(303, '/login');
};
