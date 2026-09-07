import { tool } from 'ai';
import { z } from 'zod';
import { getCompany as loadCompany } from '$lib/server/crm/companies';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';
import { companySummarySchema, summarizeCompany } from './search-companies';
import { contactSummarySchema, summarizeContact } from './search-contacts';

export const getCompanyAccess: ToolAccess = { feature: 'companies', level: 'read' };

export const getCompany = tool({
	description:
		'Everything about one company: the record plus the people at it. ' +
		'Needs the company id from searchCompanies.',
	inputSchema: z.object({
		companyId: z.guid().describe('The company id, from searchCompanies.')
	}),
	outputSchema: z.object({
		found: z.boolean(),
		company: companySummarySchema
			.extend({ phone: z.string().nullable(), website: z.string().nullable() })
			.optional(),
		contacts: z.array(contactSummarySchema)
	}),
	contextSchema: toolContextSchema,
	execute: async ({ companyId }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, getCompanyAccess);
		const company = await loadCompany(supabase, orgId, companyId);
		if (!company) return { found: false, contacts: [] };
		const parent = { id: company.id, name: company.name };
		return {
			found: true,
			company: { ...summarizeCompany(company), phone: company.phone, website: company.website },
			contacts: company.contacts.map((contact) => summarizeContact(contact, parent))
		};
	}
});
