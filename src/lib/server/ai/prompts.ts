import type { SystemModelMessage } from 'ai';

/**
 * The assistant's standing instructions. Stable text, so it goes first and
 * carries the provider's cache-control marker: with Anthropic, everything up
 * to and including this block is served from the prompt cache on the second
 * turn. Per-request facts live in `sessionContext()`, after it, so they never
 * invalidate the cached prefix.
 */
export const ASSISTANT_INSTRUCTIONS = `You are the assistant built into this workspace: a CRM where a team tracks the companies and contacts it works with, its deals, tasks and support tickets.

How to work:
- Answer questions about the organization's data with the tools you are given. Never guess or invent a record, an id, a date or a number — if a tool did not return it, say you could not find it.
- Look a company or contact up before acting on one, and ask which is meant when a name matches several.
- Before you create, complete or delete anything, make sure you have everything the tool needs; ask for what is missing rather than assuming it.
- If you have no tool for what the user asks, say plainly that you cannot do that here. When an action is denied or not approved, do not retry it.
- Keep answers short and direct. Use markdown for structure: bold for names, a list for several items, a small table for tabular data. Never use headings.
- Use the user's time zone from the session context, and write dates out ("Fri 12 Sep") rather than raw timestamps.`;

export type SessionContext = {
	orgName: string;
	tierName: string;
	/** The caller's org-level role, so the model knows whether it is talking to an owner. */
	role: string;
	userName?: string | undefined;
	timeZone?: string | undefined;
	/** Injectable so tests get a fixed clock. */
	now?: Date;
};

/** A time zone the runtime accepts, else UTC — a bad value from the browser must not break a request. */
export function resolveTimeZone(timeZone: string | undefined): string {
	if (!timeZone) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return timeZone;
	} catch {
		return 'UTC';
	}
}

/** The per-request block: who is asking, where, and what time it is there. */
export function sessionContext(ctx: SessionContext): string {
	const timeZone = resolveTimeZone(ctx.timeZone);
	const now = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'full',
		timeStyle: 'short',
		timeZone
	}).format(ctx.now ?? new Date());

	const lines = [
		`Organization: ${ctx.orgName} (${ctx.tierName} plan)`,
		`User: ${ctx.userName ?? 'a team member'} (${ctx.role})`,
		`Time zone: ${timeZone}`,
		`Now: ${now}`
	];
	return `<session_context>\n${lines.join('\n')}\n</session_context>`;
}

/**
 * The agent's `instructions`: the stable persona (cached), then the session
 * block. Two system messages rather than one string so the cache boundary
 * falls exactly between them.
 */
export function buildInstructions(ctx: SessionContext): SystemModelMessage[] {
	return [
		{
			role: 'system',
			content: ASSISTANT_INSTRUCTIONS,
			providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
		},
		{ role: 'system', content: sessionContext(ctx) }
	];
}
