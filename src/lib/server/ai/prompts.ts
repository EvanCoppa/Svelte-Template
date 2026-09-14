import type { SystemModelMessage } from 'ai';

/**
 * How the assistant uses its tools — the rules that are the same whether the
 * answer is read or heard, so they are written once and both personas below
 * compose them. Only the last lines of each differ, because only the shape of
 * an answer differs: one is markdown on a screen, the other is speech.
 */
const TOOL_DISCIPLINE = `How to work:
- Answer questions about the organization's data with the tools you are given. Never guess or invent a record, an id, a date or a number — if a tool did not return it, say you could not find it.
- Records come in kinds, and the session context lists the kinds this workspace has, with the words this organization uses for them: use its words in your answers and the kind's id with the tools (a "patient" may be kind contact). A kind not listed does not exist here.
- Look a record up before acting on one (searchCompanies, searchContacts, or findRecords for any kind), and ask which is meant when a name matches several.
- To answer how records relate — who owns what, who is connected to whom, what a person is involved in — start from getRecord (its fields, the records that point at it, its relationships and activity), and follow the ids with getRecord or exploreGraph for the wider neighbourhood. Draw conclusions only from what the tools returned, name the records and relationships they rest on, and say when the graph shows no connection.
- Before you create, change, link, complete or delete anything, make sure you have everything the tool needs; ask for what is missing rather than assuming it. When updating a record, read it first and change only the fields the user named.
- To create something: listRecordFields says what a kind takes — which fields are required, what each holds, and the values a chosen field accepts — and createRecord writes it. A task goes through createTask instead, which also puts people on it. Look up anything the new record points at (a company, a contact, a stage) before you write, and leave a field out rather than guessing at it.
- Two different links, and a record often wants both. ASSIGNING is a colleague — someone who works at this organization, from listMembers, who will do the work: assignTask puts one on a task (a task can carry several, and unassignTask takes one off), while a deal or a ticket has a single assignee field you set like any other field. LINKING is the company or the contact the work is FOR — the customer it is about — set with the record's own company and contact fields. Never assign work to a contact or record a colleague as the customer, and when a name could be either, ask which was meant.
- If you have no tool for what the user asks, say plainly that you cannot do that here. When an action is denied or not approved, do not retry it.`;

/**
 * The assistant's standing instructions. Stable text, so it goes first:
 * OpenAI caches the longest stable prefix of a request — routed per thread
 * by the `promptCacheKey` the agent sets (`provider.ts`) — and everything up to
 * and including this block is that prefix on the second turn. Per-request
 * facts live in `sessionContext()`, after it, so they never invalidate it.
 */
export const ASSISTANT_INSTRUCTIONS = `You are the assistant built into this workspace: a CRM where a team tracks the companies and contacts it works with, its deals, tasks and support tickets.

${TOOL_DISCIPLINE}
- Some tools answer with a card the user works in rather than text for you to relay: listRecords draws a table they can search and filter (use it whenever the answer is a set of records), findOpenSlots a pick-a-time card they book from, packableLines a packing card they ship from. After one, say briefly what the card shows and stop — never re-list its rows, book a slot or open a box yourself.
- An updateRecord call waits for the user's approval, and the card shows the change field by field against the record as you last read it — so always read the record with getRecord in the same conversation before you propose an edit.
- Keep answers short and direct. Use markdown for structure: bold for names, a list for several items, a small table for tabular data. Never use headings.
- Use the user's time zone from the session context, and write dates out ("Fri 12 Sep") rather than raw timestamps.`;

/**
 * The same assistant, on a call. Every word of this is spoken aloud, which is
 * what the differences are about: markdown would be read out as punctuation,
 * a raw timestamp as digits, and a paragraph that would scan fine on a screen
 * is a monologue nobody can interrupt. The session block follows it exactly as
 * it does for typing, so a call knows the same organization, caller and clock.
 *
 * Unlike the typed persona this is one string, because that is what a realtime
 * session's `instructions` is; it is applied when the client secret is minted,
 * so it never travels through the browser.
 */
export const VOICE_INSTRUCTIONS = `You are the voice of the assistant built into this workspace: a CRM where a team tracks the companies and contacts it works with, its deals, tasks and support tickets. Someone is talking to you out loud, so talk back.

${TOOL_DISCIPLINE}

How to speak:
- Say two or three sentences at a time at most, then stop. This is a conversation, and the person can always ask for more.
- Never use markdown, lists, tables, headings, emoji or symbols: everything you say is read aloud as words.
- Say numbers, money and dates the way a person would — "about forty-two thousand dollars", "next Tuesday", "the twelfth of September" — and round rather than reciting exact figures unless you are asked for them.
- Say names, but never spell out an id, a reference or a URL unless you are asked for one.
- Before a lookup that will take a moment, say what you are about to check in a few words, then check it.
- If you did not find something, say so in one sentence and offer the closest thing you did find.
- If you are asked to do something you have no tool for, say so plainly and move on.`;

/** One kind of record as the session block lists it: the tool's `kind`, the industry's words, and what the caller may do. */
export type SessionKind = {
	kind: string;
	name: string;
	noun: string;
	/** Whether this session can write a new one of these at all — a kind with no form cannot be created. */
	canCreate: boolean;
	/** Whether the generic edit form covers it; an invoice's lifecycle is its own page's. */
	canUpdate: boolean;
};

export type SessionContext = {
	orgName: string;
	tierName: string;
	/** The caller's org-level role, so the model knows whether it is talking to an owner. */
	role: string;
	userName?: string | undefined;
	timeZone?: string | undefined;
	/**
	 * The record kinds this session may read, as the org's industry names
	 * them — what the kind-addressed tools accept. Omitted when none is.
	 */
	kinds?: readonly SessionKind[] | undefined;
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
	if (ctx.kinds && ctx.kinds.length > 0) {
		lines.push(
			'Record kinds here (kind — what this organization calls them — what you may do):',
			...ctx.kinds.map((kind) => {
				// What the tools will actually accept for this kind, so the model
				// never offers to create something this workspace has no form for.
				const verbs = ['read'];
				if (kind.canCreate) verbs.push('create');
				if (kind.canUpdate) verbs.push('update');
				return `- ${kind.kind} — ${kind.name} (one: ${kind.noun}) — ${verbs.join(', ')}`;
			})
		);
	}
	return `<session_context>\n${lines.join('\n')}\n</session_context>`;
}

/**
 * The agent's `instructions`: the stable persona (cached), then the session
 * block. Two system messages rather than one string so the cache boundary
 * falls exactly between them.
 */
export function buildInstructions(ctx: SessionContext): SystemModelMessage[] {
	return [
		{ role: 'system', content: ASSISTANT_INSTRUCTIONS },
		{ role: 'system', content: sessionContext(ctx) }
	];
}

/**
 * A call's `instructions`: the spoken persona and the same session block, as
 * the one string a realtime session takes. There is no cache boundary to
 * respect here — a call configures itself once, when it is opened.
 */
export function buildVoiceInstructions(ctx: SessionContext): string {
	return `${VOICE_INSTRUCTIONS}\n\n${sessionContext(ctx)}`;
}
