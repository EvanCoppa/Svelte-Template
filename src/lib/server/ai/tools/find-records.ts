import { tool } from 'ai';
import { z } from 'zod';
import { listRecordNames } from '$lib/server/crm/records';
import { toolContextSchema } from '../context';
import { anyRecordAccess, recordAccess, requireToolContext } from './access';
import { recordKindSchema } from './record-ref';

/**
 * Offered while the caller may read any kind of record; each call re-checks
 * the one kind it names.
 */
export const findRecordsAccess = anyRecordAccess('read');

const MAX_RESULTS = 50;

export const findRecords = tool({
	description:
		'Find records of one kind by name — any kind the session context lists: a product, a ' +
		'proposal, an invoice, an asset, a property, an order… Returns ids to pass to ' +
		'getRecord, updateRecord or exploreGraph. Omit the query to list every record of the ' +
		'kind. For companies and contacts, searchCompanies and searchContacts offer more filters.',
	inputSchema: z.object({
		kind: recordKindSchema,
		query: z
			.string()
			.trim()
			.max(200)
			.optional()
			.describe('Text to match against the record name (case-insensitive). Omit to list all.'),
		limit: z
			.number()
			.int()
			.min(1)
			.max(MAX_RESULTS)
			.default(20)
			.describe('How many matches to return, at most 50.')
	}),
	outputSchema: z.object({
		kind: recordKindSchema,
		records: z.array(z.object({ id: z.string(), name: z.string() })),
		total: z.number().int().describe('How many records matched, before the limit.')
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, query, limit }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, recordAccess(kind, 'read'));
		const needle = query?.toLowerCase();
		const matches = (await listRecordNames(supabase, orgId, kind)).filter(
			(record) => !needle || record.name.toLowerCase().includes(needle)
		);
		return { kind, records: matches.slice(0, limit), total: matches.length };
	}
});
