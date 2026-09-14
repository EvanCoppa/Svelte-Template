import { tool } from 'ai';
import { z } from 'zod';
import { Constants } from '$lib/database.types';
import { getOrder } from '$lib/server/crm/orders';
import { packableLines as readPackableLines } from '$lib/server/crm/shipments';
import { toolContextSchema } from '../context';
import { isToolActive, requireToolContext, type ToolAccess } from './access';

/**
 * The card exists to open a box, which is the `shipments` grant's — the
 * order page's "Ship this order" takes the same one, not the order's. The
 * order itself is read on its own grant inside the call.
 */
export const packableLinesAccess: ToolAccess = { feature: 'shipments', level: 'manage' };

const lineSchema = z.object({
	id: z.string(),
	description: z.string(),
	sku: z.string().nullable(),
	quantity: z.number(),
	unitPrice: z.number(),
	status: z.enum(Constants.public.Enums.line_fulfillment_status)
});

export const packableLines = tool({
	description:
		'Show the user what is left to ship on one order as a packing card: every line not yet ' +
		'in a box, which they tick into a new shipment — some of a line’s quantity or all of ' +
		'it. Use it when the user wants to ship, pack or send an order. The card opens the ' +
		'box; do not try to create a shipment yourself.',
	inputSchema: z.object({
		orderId: z.guid().describe('The order, from findRecords (kind order) or getRecord.')
	}),
	outputSchema: z.object({
		found: z.boolean(),
		order: z
			.object({
				id: z.string(),
				number: z.string(),
				status: z.enum(Constants.public.Enums.order_status),
				/** The company when one is named, else the person — the ledger's account rule. */
				customer: z.string().nullable()
			})
			.optional(),
		lines: z.array(lineSchema),
		/** How many of the order's lines are already in a box. */
		packed: z.number().int(),
		/**
		 * Whether the caller may open the box: the shipments grant the tool
		 * already took, plus `manage` on orders, since packing part of a line
		 * splits it. The page's action re-checks both.
		 */
		canPack: z.boolean()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ orderId }, { context }) => {
		requireToolContext(context, packableLinesAccess);
		const { supabase, orgId, org } = requireToolContext(context, {
			feature: 'orders',
			level: 'read'
		});
		const canPack = isToolActive(org, { feature: 'orders', level: 'manage' });

		const order = await getOrder(supabase, orgId, orderId);
		if (!order) return { found: false, lines: [], packed: 0, canPack };

		const lines = await readPackableLines(supabase, orgId, orderId);
		return {
			found: true,
			order: {
				id: order.id,
				number: order.number,
				status: order.status,
				customer: order.companies?.name ?? order.contacts?.name ?? null
			},
			lines: lines.map((line) => ({
				id: line.id,
				description: line.description,
				sku: line.product_sku_snapshot,
				quantity: line.quantity,
				unitPrice: line.unit_price,
				status: line.fulfillment_status
			})),
			packed: order.order_line_items.length - lines.length,
			canPack
		};
	}
});
