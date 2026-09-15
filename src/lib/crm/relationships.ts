import type { Tables } from '$lib/database.types';
import type { RecordKind } from './records';
import { RELATIONSHIP_OTHER_KINDS, type RelationshipOtherKind } from '$lib/schemas/relationships';

/**
 * The client-safe half of the relationship graph's write side — pure enough
 * for the record page's Relationships card to import directly, mirroring
 * `$lib/crm/records` beside `$lib/server/crm/records`.
 */

export type RelationshipTypeRow = Pick<
	Tables<'relationship_types'>,
	'id' | 'forward_label' | 'inverse_label' | 'source_type' | 'target_type'
>;

/** A relationship type as offered from one record's side: which label reads
 *  from here, and which kind the other end must be (null when the reader
 *  picks). `value` is what the form's type Combobox posts, split back into
 *  `typeId` and `direction` by the two hidden inputs beside it. */
export type RelationshipTypeOption = {
	value: string;
	label: string;
	otherKind: RelationshipOtherKind | null;
};

const SUPPORTED_OTHER_KINDS = new Set<string>(RELATIONSHIP_OTHER_KINDS);

function supportedKind(kind: string | null): kind is RelationshipOtherKind | null {
	return kind === null || SUPPORTED_OTHER_KINDS.has(kind);
}

/**
 * The type+direction choices that fit this record on its side, in the order
 * the types are given. A symmetric type (the same label both ways, like
 * "spouse of") offers one choice rather than two identical-looking ones —
 * the picker must never draw the same fact from both directions
 * (docs/relationships.md, "Rules the first writer must follow"). A type
 * whose other side is a kind this app has no picker for (an entity kind with
 * no record page and no roster, like `proposal_option`) is left out rather
 * than offered with nothing to pick.
 */
export function relationshipTypeOptions(
	types: readonly RelationshipTypeRow[],
	kind: RecordKind
): RelationshipTypeOption[] {
	return types.flatMap((type): RelationshipTypeOption[] => {
		const symmetric = type.forward_label === type.inverse_label;
		const forward =
			(type.source_type === null || type.source_type === kind) && supportedKind(type.target_type)
				? { value: `${type.id}:forward`, label: type.forward_label, otherKind: type.target_type }
				: null;
		const inverse =
			(type.target_type === null || type.target_type === kind) && supportedKind(type.source_type)
				? { value: `${type.id}:inverse`, label: type.inverse_label, otherKind: type.source_type }
				: null;
		if (symmetric) return forward ? [forward] : inverse ? [inverse] : [];
		return [...(forward ? [forward] : []), ...(inverse ? [inverse] : [])];
	});
}
