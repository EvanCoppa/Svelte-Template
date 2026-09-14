import { z } from 'zod';
import { RECORD_KINDS } from '$lib/crm/records';

/**
 * The relationship graph's write side: a type (and which side of it this
 * record stands on) plus the other record, across any kind — the "type
 * picker plus a record picker across kinds" docs/relationships.md calls out
 * as not built yet. `otherKind` widens past `RecordKind` to include
 * `'member'`, the one entity kind with no record page of its own (docs,
 * "Members are a kind, keyed by the membership").
 */

export const RELATIONSHIP_OTHER_KINDS = [...RECORD_KINDS, 'member'] as const;
export type RelationshipOtherKind = (typeof RELATIONSHIP_OTHER_KINDS)[number];

export const addRelationshipSchema = z.object({
	/** `<relationship_types.id>`, paired with which side of it this record is on. */
	typeId: z.guid(),
	direction: z.enum(['forward', 'inverse']),
	/**
	 * A plain string rather than `z.enum(RELATIONSHIP_OTHER_KINDS)`: the form
	 * sets it before the reader has chosen anything (an empty combobox is a
	 * blank string, not a member of the enum), so the action re-checks
	 * membership itself once the whole form is otherwise valid.
	 */
	otherKind: z.string().min(1, 'Choose a kind of record.'),
	otherId: z.guid()
});

export const removeRelationshipSchema = z.object({ id: z.guid() });
