import { tool } from 'ai';
import { z } from 'zod';
import { Constants } from '$lib/database.types';
import { listDeals as loadDeals } from '$lib/server/crm/deals';
import { toolContextSchema } from '../context';
import { requireToolContext, type ToolAccess } from './access';

export const listDealsAccess: ToolAccess = { feature: 'deals', level: 'read' };

const dealStageSchema = z.enum(Constants.public.Enums.deal_stage);

const dealSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	amount: z.number().nullable(),
	stage: dealStageSchema,
	clientId: z.string(),
	clientName: z.string(),
	expectedCloseDate: z.string().nullable()
});

export const listDeals = tool({
	description:
		'List deals in the pipeline, newest first, with the client each belongs to. ' +
		'Narrow by stage, or to one client with its id from searchClients.',
	inputSchema: z.object({
		clientId: z.guid().optional().describe('Only deals with this client.'),
		stage: dealStageSchema.optional().describe('Only deals in this stage.')
	}),
	outputSchema: z.object({ deals: z.array(dealSummarySchema) }),
	contextSchema: toolContextSchema,
	execute: async ({ clientId, stage }, { context }) => {
		const { supabase, orgId } = requireToolContext(context, listDealsAccess);
		const deals = await loadDeals(supabase, orgId, { clientId, stage });
		return {
			deals: deals.map((deal) => ({
				id: deal.id,
				title: deal.title,
				amount: deal.amount,
				stage: deal.stage,
				clientId: deal.clients.id,
				clientName: deal.clients.name,
				expectedCloseDate: deal.expected_close_date
			}))
		};
	}
});
