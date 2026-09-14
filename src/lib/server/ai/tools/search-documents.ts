import { tool } from 'ai';
import { z } from 'zod';
import { documentTitle } from '$lib/crm/documents';
import { listDocuments } from '$lib/server/crm/documents';
import { toolContextSchema } from '../context';
import { searchContent } from '../retrieval';
import { requireToolContext, type ToolAccess } from './access';

export const searchDocumentsAccess: ToolAccess = { feature: 'documents', level: 'read' };

/**
 * The one tool that answers from what the organization WROTE rather than from
 * what it recorded.
 *
 * Every other tool here reads columns — a deal's stage, an invoice's balance,
 * a contact's email. This one reads prose, which is where the reasoning lives:
 * why the discount was agreed, what the crew found on the roof, what was
 * promised in the meeting. Those are not fields and never will be.
 *
 * It is gated on the `documents` feature at `read`, so an org that has not
 * turned pages on has no such tool, and a member who cannot open `/documents`
 * cannot read a page's contents through the assistant either. The passages
 * come back through `searchContent()`, which searches only the caller's own
 * org — RLS decides, and the search function runs as the invoker precisely so
 * it keeps deciding.
 *
 * **Passages are quoted, not summarised.** The tool returns the org's own
 * words and the page they came from, so the model cites rather than
 * paraphrases, and a reader can open the page and check.
 *
 * When a second kind of writing is indexed — a note, a ticket thread — this
 * tool grows a `kinds` input and its access becomes `anyOf`, exactly as the
 * kind-addressed tools do. Nothing about the table or the search changes.
 */

const MAX_RESULTS = 8;

export const searchDocuments = tool({
	description:
		'Search what the organization has WRITTEN — pages, write-ups, account strategy, meeting ' +
		'notes — by meaning rather than by keyword. Use this for questions about reasoning, ' +
		'context or what was agreed, which live in prose rather than in a record field. Returns ' +
		'the passages themselves with the page each came from; quote and cite them rather than ' +
		'paraphrasing. Use findRecords or getRecord instead when the answer is a field on a record.',
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.min(2, 'Say what to look for.')
			.max(500)
			.describe('What to look for, in the words a person would use. A question works well.'),
		limit: z
			.number()
			.int()
			.min(1)
			.max(MAX_RESULTS)
			.default(MAX_RESULTS)
			.describe('How many passages to return, at most 8.')
	}),
	outputSchema: z.object({
		passages: z.array(
			z.object({
				documentId: z.string(),
				title: z.string(),
				/** The passage, heading trail included, exactly as it is written. */
				content: z.string(),
				/** 0–1 when meaning matched; null when the words did. */
				similarity: z.number().nullable()
			})
		),
		/**
		 * How the passages were found, so the model can be honest about it:
		 * `text` means an exact-word match, which finds less and is all there
		 * is when embeddings are unavailable.
		 */
		mode: z.enum(['vector', 'text']),
		total: z.number().int()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ query, limit }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, searchDocumentsAccess);

		const { hits, mode } = await searchContent(supabase, orgId, query, {
			kinds: ['document'],
			limit
		});
		if (hits.length === 0) return { passages: [], mode, total: 0 };

		// Name the pages the passages came from, in one read. A page RLS hides
		// has no name here and its passages are dropped: the search already
		// scoped to this org, and this is the same belt the record page wears.
		const ids = [...new Set(hits.map((hit) => hit.entityId))];
		const documents = await listDocuments(supabase, orgId, { ids });
		const titles = new Map(documents.map((row) => [row.id, documentTitle(row)]));

		const passages = hits.flatMap((hit) => {
			const title = titles.get(hit.entityId);
			return title
				? [
						{
							documentId: hit.entityId,
							title,
							content: hit.content,
							similarity: hit.similarity
						}
					]
				: [];
		});

		return { passages, mode, total: passages.length };
	}
});
