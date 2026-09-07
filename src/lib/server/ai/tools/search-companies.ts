import { tool } from 'ai';
import { z } from 'zod';
import { Constants } from '$lib/database.types';
import { listCompanies, type Company } from '$lib/server/crm/companies';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const searchCompaniesAccess: ToolAccess = { feature: 'companies', level: 'read' };

export const partyStatusSchema = z.enum(Constants.public.Enums.party_status);
export const companyRelationshipSchema = z.enum(Constants.public.Enums.company_relationship);

/** What the model gets back about a company — enough to name it and act on it, never the whole row. */
export const companySummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	relationship: companyRelationshipSchema,
	status: partyStatusSchema
});

export function summarizeCompany(company: Company): z.infer<typeof companySummarySchema> {
	return {
		id: company.id,
		name: company.name,
		email: company.email,
		relationship: company.relationship,
		status: company.status
	};
}

const MAX_RESULTS = 20;

export const searchCompanies = tool({
	description:
		'Find companies by name or email, optionally narrowed to one side of the business ' +
		'(customer, supplier, partner) or a lifecycle status. Call this before any tool that ' +
		'needs a company id. Returns at most 20 matches.',
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.max(200)
			.optional()
			.describe('Text to match against the company name or email. Omit to list every company.'),
		relationship: companyRelationshipSchema
			.optional()
			.describe('Only companies on this side of the business.'),
		status: partyStatusSchema.optional().describe('Only companies in this lifecycle status.')
	}),
	outputSchema: z.object({
		companies: z.array(companySummarySchema),
		total: z.number().int().describe('How many companies matched, before the 20-result cap.')
	}),
	contextSchema: toolContextSchema,
	execute: async ({ query, relationship, status }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, searchCompaniesAccess);
		const needle = query?.toLowerCase();
		const matches = (await listCompanies(supabase, orgId, { relationship })).filter(
			(company) =>
				(!status || company.status === status) &&
				(!needle ||
					[company.name, company.email].some((value) => value?.toLowerCase().includes(needle)))
		);
		return {
			companies: matches.slice(0, MAX_RESULTS).map(summarizeCompany),
			total: matches.length
		};
	}
});
