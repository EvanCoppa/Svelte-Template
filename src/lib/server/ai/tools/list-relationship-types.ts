import { tool } from 'ai';
import { z } from 'zod';
import { listRelationshipTypes as loadTypes } from '$lib/server/crm/relationships';
import { toolContextSchema } from '../context';
import { anyRecordAccess, requireToolContext } from './access';

/** Reference data every record page reads; offered to anyone who may read a record. */
export const listRelationshipTypesAccess = anyRecordAccess('read');

export const listRelationshipTypes = tool({
	description:
		'The kinds of relationship this workspace draws between records — the system ones and ' +
		'the organization’s own — each with the label read from either end and, where the type ' +
		'fixes them, the kinds at each end. Needed before linkRecords; useful for reading an ' +
		'edge label from exploreGraph.',
	inputSchema: z.object({}),
	outputSchema: z.object({
		types: z.array(
			z.object({
				id: z.string(),
				key: z.string(),
				forwardLabel: z.string().describe('"<from> owns <to>"'),
				inverseLabel: z.string().describe('"<to> owned by <from>"'),
				fromKind: z.string().nullable().describe('The kind the from end must be, or any.'),
				toKind: z.string().nullable().describe('The kind the to end must be, or any.')
			})
		)
	}),
	contextSchema: toolContextSchema,
	execute: async (_input, { context }) => {
		const { supabase, orgId } = requireToolContext(context, listRelationshipTypesAccess);
		const types = await loadTypes(supabase, orgId);
		return {
			types: types.map((type) => ({
				id: type.id,
				key: type.key,
				forwardLabel: type.forward_label,
				inverseLabel: type.inverse_label,
				fromKind: type.source_type,
				toKind: type.target_type
			}))
		};
	}
});
