import { tool } from 'ai';
import { z } from 'zod';
import type { CrmEntityRef } from '$lib/server/crm/entity';
import {
	createRelationship,
	listRelationships,
	orientRelationship
} from '$lib/server/crm/relationships';
import { RELATIONSHIP_OTHER_KINDS } from '$lib/schemas/relationships';
import { toolContextSchema } from '../context';
import { anyRecordAccess, canOpenFor, recordAccess, requireToolContext } from './access';
import { recordKindSchema } from './record-ref';

/**
 * Drawing a relationship is an edit to the record it is drawn from — the
 * record page's rule: `manage` on that record's kind, and the other end
 * must be a kind the caller may open (or a member, who takes no grant).
 */
export const linkRecordsAccess = anyRecordAccess('manage');

export const linkRecords = tool({
	description:
		'Draw a relationship between two records in the graph, of a type from ' +
		'listRelationshipTypes: "<from> <forward label> <to>", so pick the ends to match the ' +
		'type’s labels and kinds. The other end may be a member (someone who works here) by ' +
		'user id. Refuses a duplicate of an open relationship of the same type.',
	inputSchema: z.object({
		typeId: z.guid().describe('The relationship type id, from listRelationshipTypes.'),
		from: z
			.object({ kind: recordKindSchema, id: z.guid() })
			.describe('The record the type reads from.'),
		to: z
			.object({ kind: z.enum(RELATIONSHIP_OTHER_KINDS), id: z.guid() })
			.describe('The record (or member) the type reads to.'),
		notes: z.string().trim().max(2000).optional().describe('A note on the relationship.')
	}),
	outputSchema: z.object({ relationshipId: z.string(), typeId: z.string() }),
	contextSchema: toolContextSchema,
	execute: async ({ typeId, from, to, notes }, { context }) => {
		const { supabase, orgId, org } = requireToolContext(context, recordAccess(from.kind, 'manage'));
		if (to.kind !== 'member' && !canOpenFor(org)(to.kind)) {
			throw new Error(`This organization or your role does not allow "read" on ${to.kind}.`);
		}
		const fromEntity: CrmEntityRef = { entityType: from.kind, entityId: from.id };
		const toEntity: CrmEntityRef = { entityType: to.kind, entityId: to.id };

		// One fact is one row however it is read (docs/relationships.md): the
		// same check the record page makes before it draws one.
		const existing = await listRelationships(supabase, orgId, fromEntity, {
			typeId,
			openOnly: true
		});
		const duplicate = existing.some((row) => {
			const { other } = orientRelationship(row, fromEntity);
			return other.entityType === toEntity.entityType && other.entityId === toEntity.entityId;
		});
		if (duplicate) throw new Error('A relationship like this already exists.');

		const values = { typeId, from: fromEntity, to: toEntity, notes: notes || null };
		const row = await createRelationship(supabase, orgId, values);
		return { relationshipId: row.id, typeId };
	}
});
