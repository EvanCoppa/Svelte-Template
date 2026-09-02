import { error, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { createSupabaseAdminClient } from '$lib/supabase.server';
import { unwrap } from './crm/unwrap';

/**
 * Platform operators — who may open the /admin console.
 *
 * Owners and admins run one organization; an operator runs the deployment
 * and edits the reference data everything else treats as migration /
 * service-role territory (the feature registry, the role catalog, per-org
 * plans and overrides). Membership is a row in `platform_operators`, added
 * by migration or SQL, never from the browser — see the platform_operators
 * migration. It is global: not a feature, not an org role, never in the
 * sidebar.
 */

/** Does this user hold an operator row? RLS shows a user only their own. */
export async function isPlatformOperator(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<boolean> {
	const rows = unwrap(
		await supabase.from('platform_operators').select('user_id').eq('user_id', userId).limit(1)
	);
	return rows.length > 0;
}

export interface OperatorDeps {
	/** Injectable so tests never touch the real service-role key. */
	createAdminClient?: () => SupabaseClient<Database>;
}

/**
 * The gate every /admin load and action opens with. Anyone else gets a 404
 * — the console does not exist as far as a non-operator can tell — and an
 * operator gets the service-role client back. That client is the only way
 * admin code writes, and this is the only way admin code obtains it, so the
 * check cannot be skipped by accident.
 */
export async function requireOperator(
	locals: Pick<App.Locals, 'supabase' | 'user'>,
	deps: OperatorDeps = {}
): Promise<SupabaseClient<Database>> {
	if (!locals.user) throw redirect(303, '/login');
	if (!(await isPlatformOperator(locals.supabase, locals.user.id))) {
		throw error(404, 'Not found.');
	}

	const createAdminClient = deps.createAdminClient ?? createSupabaseAdminClient;
	try {
		return createAdminClient();
	} catch (cause) {
		console.error('[operator] service-role client unavailable', cause);
		throw error(500, 'The admin console needs SUPABASE_SERVICE_ROLE_KEY to be set.');
	}
}
