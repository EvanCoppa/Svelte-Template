import { tool } from 'ai';
import { z } from 'zod';
import { Constants } from '$lib/database.types';
import { listDeals as loadDeals } from '$lib/server/crm/deals';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const listDealsAccess: ToolAccess = { feature: 'deals', level: 'read' };

const stageOutcomeSchema = z.enum(Constants.public.Enums.stage_outcome);

const dealSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	amount: z.number().nullable(),
	/** The stage's name on the org's own board; stages are rows, not a fixed list. */
	stage: z.string(),
	outcome: stageOutcomeSchema,
	companyId: z.string().nullable(),
	companyName: z.string().nullable(),
	contactId: z.string().nullable(),
	contactName: z.string().nullable(),
	expectedCloseDate: z.string().nullable()
});

export const listDeals = tool({
	description:
		'List deals, newest first, with the stage each sits in and the company or contact it ' +
		'belongs to. Narrow to open, won or lost deals, or to one company or contact by id.',
	inputSchema: z.object({
		companyId: z.guid().optional().describe('Only deals with this company, from searchCompanies.'),
		contactId: z.guid().optional().describe('Only deals with this contact, from searchContacts.'),
		outcome: stageOutcomeSchema
			.optional()
			.describe('Only deals whose stage has this outcome: open, won or lost.')
	}),
	outputSchema: z.object({ deals: z.array(dealSummarySchema) }),
	contextSchema: toolContextSchema,
	execute: async ({ companyId, contactId, outcome }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, listDealsAccess);
		const deals = (await loadDeals(supabase, orgId, { companyId, contactId })).filter(
			(deal) => !outcome || deal.pipeline_stages.outcome === outcome
		);
		return {
			deals: deals.map((deal) => ({
				id: deal.id,
				title: deal.title,
				amount: deal.amount,
				stage: deal.pipeline_stages.name,
				outcome: deal.pipeline_stages.outcome,
				companyId: deal.companies?.id ?? null,
				companyName: deal.companies?.name ?? null,
				contactId: deal.contacts?.id ?? null,
				contactName: deal.contacts?.name ?? null,
				expectedCloseDate: deal.expected_close_date
			}))
		};
	}
});
