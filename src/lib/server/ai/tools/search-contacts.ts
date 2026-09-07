import { tool } from 'ai';
import { z } from 'zod';
import { listContacts, type Contact } from '$lib/server/crm/contacts';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { partyStatusSchema } from './search-companies';

export const searchContactsAccess: ToolAccess = { feature: 'contacts', level: 'read' };

/** A person, with the company they belong to when they have one. */
export const contactSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	title: z.string().nullable(),
	isPrimary: z.boolean(),
	status: partyStatusSchema,
	companyId: z.string().nullable(),
	companyName: z.string().nullable()
});

export function summarizeContact(
	contact: Contact,
	company: { id: string; name: string } | null
): z.infer<typeof contactSummarySchema> {
	return {
		id: contact.id,
		name: contact.name,
		email: contact.email,
		phone: contact.phone,
		title: contact.title,
		isPrimary: contact.is_primary,
		status: contact.status,
		companyId: company?.id ?? null,
		companyName: company?.name ?? null
	};
}

const MAX_RESULTS = 20;

export const searchContacts = tool({
	description:
		'Find people by name or email, optionally within one company or in a lifecycle status. ' +
		'A contact may stand alone with no company. Call this before any tool that needs a ' +
		'contact id. Returns at most 20 matches.',
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.max(200)
			.optional()
			.describe('Text to match against the contact name or email. Omit to list everyone.'),
		companyId: z.guid().optional().describe('Only people at this company, from searchCompanies.'),
		status: partyStatusSchema.optional().describe('Only contacts in this lifecycle status.')
	}),
	outputSchema: z.object({
		contacts: z.array(contactSummarySchema),
		total: z.number().int().describe('How many contacts matched, before the 20-result cap.')
	}),
	contextSchema: toolContextSchema,
	execute: async ({ query, companyId, status }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, searchContactsAccess);
		const needle = query?.toLowerCase();
		const matches = (await listContacts(supabase, orgId, { companyId })).filter(
			(contact) =>
				(!status || contact.status === status) &&
				(!needle ||
					[contact.name, contact.email].some((value) => value?.toLowerCase().includes(needle)))
		);
		return {
			contacts: matches
				.slice(0, MAX_RESULTS)
				.map((contact) => summarizeContact(contact, contact.companies)),
			total: matches.length
		};
	}
});
