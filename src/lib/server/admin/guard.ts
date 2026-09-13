import { error } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { isSystemAdmin } from '$lib/server/roles';

/**
 * The authorization boundary of the platform area.
 *
 * `/admin` is not a tenant surface: it has no organization, no industry
 * vocabulary, no tier and no feature registry behind it, so none of the
 * gating the rest of the app leans on applies. What stands in its place is
 * this one check, and the rule is that EVERY admin entry point performs it
 * for itself — the `(admin)` layout load covers the pages (a layout load
 * runs before every child page's), and each action and endpoint repeats it,
 * because a POST reaches an action without any load running first. The
 * `systemAdmin` boolean the org picker reads is a convenience for drawing a
 * menu entry; it is never the protection.
 *
 * A non-operator gets 404, not 403, for the same reason a `hidden` feature
 * does (`$lib/features/gate`): a refusal that confirms the page is real
 * tells every tenant user where the platform console lives. The operator
 * list is unlistable by design (a user can only read their own
 * `system_admins` row), and this keeps the surface as quiet.
 *
 * Fails closed: `isSystemAdmin()` throws on a database error rather than
 * answering false, so a broken lookup is a 500, never an open door.
 */
export async function requireSystemAdmin(
	locals: Pick<App.Locals, 'supabase' | 'user'>
): Promise<User> {
	const { supabase, user } = locals;
	// The hook already refused anonymous requests; this is the second lock.
	if (!user) throw error(404, 'Not found.');
	if (!(await isSystemAdmin(supabase, user.id))) throw error(404, 'Not found.');
	return user;
}
