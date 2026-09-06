import type { SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { Database } from '$lib/database.types';
import type { OrgContext } from '$lib/server/org-context';

/**
 * What a tool receives as its `context`: the request-scoped Supabase client,
 * the active org (with its resolved feature modes and the caller's grants)
 * and the caller. Every tool declares it with the SDK's `contextSchema`, and
 * the agent supplies it through `toolsContext` — the SDK's channel for scoped
 * clients and permissions, which keeps them out of the prompt and off the
 * wire.
 *
 * `z.custom` because a client and an org context are live objects, not data:
 * the schema types them for the SDK and passes them through untouched.
 */
export const toolContextSchema = z.object({
	supabase: z.custom<SupabaseClient<Database>>(),
	orgId: z.guid(),
	userId: z.guid(),
	org: z.custom<OrgContext>()
});

export type AssistantToolContext = z.infer<typeof toolContextSchema>;

/**
 * The tool context for a request. The hook has already gated the route on the
 * session and the feature, so a missing org here is a bug in the wiring, not
 * something a user did.
 */
export function assistantContext(locals: App.Locals): AssistantToolContext {
	const { supabase, user, org, activeOrgId } = locals;
	if (!user) throw error(401, 'Not signed in.');
	if (!org || !activeOrgId) throw error(400, 'No active organization.');
	return { supabase, orgId: activeOrgId, userId: user.id, org };
}
