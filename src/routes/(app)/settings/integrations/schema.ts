export { exclusionSchema, mailboxIdSchema, mailboxVisibilitySchema } from '$lib/schemas/email';

/**
 * Explicit form ids, shared by the load, the actions and the page's
 * `superForm`s — five forms on one page, each posting per-row values through
 * hidden inputs. Here rather than in `+page.server.ts` because SvelteKit
 * allows that file no exports of its own, and the page imports these too.
 */
export const FORM_IDS = {
	visibility: 'mailbox-visibility',
	exclusion: 'mailbox-exclusion',
	removeExclusion: 'remove-mailbox-exclusion',
	disconnect: 'disconnect-mailbox',
	syncNow: 'sync-mailbox'
} as const;
