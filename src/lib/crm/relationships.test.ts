import { describe, expect, it } from 'vitest';
import { relationshipTypeOptions, type RelationshipTypeRow } from './relationships';

/**
 * The pure half of the Relationships card's "Add relationship" picker: which
 * type+direction choices a record of a given kind may offer, straight from
 * `relationship_types` rows — no database, no component.
 */

function type(overrides: Partial<RelationshipTypeRow> = {}): RelationshipTypeRow {
	return {
		id: 'f0000000-0000-0000-0000-000000000001',
		forward_label: 'works at',
		inverse_label: 'employs',
		source_type: 'contact',
		target_type: 'company',
		...overrides
	};
}

describe('relationshipTypeOptions', () => {
	it('offers only the side that fits, when the type is scoped', () => {
		const worksAt = type();

		expect(relationshipTypeOptions([worksAt], 'contact')).toEqual([
			{ value: `${worksAt.id}:forward`, label: 'works at', otherKind: 'company' }
		]);
		expect(relationshipTypeOptions([worksAt], 'company')).toEqual([
			{ value: `${worksAt.id}:inverse`, label: 'employs', otherKind: 'contact' }
		]);
		// Neither side is a deal, so the type is not offered at all.
		expect(relationshipTypeOptions([worksAt], 'deal')).toEqual([]);
	});

	it('offers both directions when both sides fit and the labels differ', () => {
		const reportsTo = type({
			id: 'f0000000-0000-0000-0000-000000000002',
			forward_label: 'reports to',
			inverse_label: 'manages',
			source_type: 'contact',
			target_type: 'contact'
		});

		expect(relationshipTypeOptions([reportsTo], 'contact')).toEqual([
			{ value: `${reportsTo.id}:forward`, label: 'reports to', otherKind: 'contact' },
			{ value: `${reportsTo.id}:inverse`, label: 'manages', otherKind: 'contact' }
		]);
	});

	it('collapses a symmetric label to one choice rather than two identical ones', () => {
		const spouseOf = type({
			id: 'f0000000-0000-0000-0000-000000000003',
			forward_label: 'spouse of',
			inverse_label: 'spouse of',
			source_type: 'contact',
			target_type: 'contact'
		});

		expect(relationshipTypeOptions([spouseOf], 'contact')).toEqual([
			{ value: `${spouseOf.id}:forward`, label: 'spouse of', otherKind: 'contact' }
		]);
	});

	it('fits an unscoped side to any kind', () => {
		const relatedTo = type({
			id: 'f0000000-0000-0000-0000-000000000004',
			forward_label: 'related to',
			inverse_label: 'related to',
			source_type: null,
			target_type: null
		});

		for (const kind of ['company', 'contact', 'asset', 'ticket'] as const) {
			expect(relationshipTypeOptions([relatedTo], kind)).toEqual([
				{ value: `${relatedTo.id}:forward`, label: 'related to', otherKind: null }
			]);
		}
	});

	it('drops a type whose only fitting direction points at a kind this app has no picker for', () => {
		// A hypothetical type scoped to an entity kind with no record page and
		// no roster (`proposal_option`), the way `crm_entity_type` can name one
		// even though nothing here can list it.
		const toOption = type({
			id: 'f0000000-0000-0000-0000-000000000005',
			forward_label: 'has option',
			inverse_label: 'option of',
			source_type: 'proposal',
			target_type: 'proposal_option'
		});

		// A proposal fits the `from` side, but the `to` side has no picker, so
		// nothing is offered rather than a choice with nothing to pick.
		expect(relationshipTypeOptions([toOption], 'proposal')).toEqual([]);
	});

	it('offers both directions when a null side also lets the current kind stand on it', () => {
		// `assigned_to`: scoped to an asset on the `from` side, open on `to` —
		// so an asset both names what it is assigned to (forward) and can be
		// what another asset is assigned to (inverse), a real if unusual case
		// the scope declares rather than the picker inventing.
		const assignedTo = type({
			id: 'f0000000-0000-0000-0000-000000000006',
			forward_label: 'assigned to',
			inverse_label: 'holds',
			source_type: 'asset',
			target_type: null
		});

		expect(relationshipTypeOptions([assignedTo], 'asset')).toEqual([
			{ value: `${assignedTo.id}:forward`, label: 'assigned to', otherKind: null },
			{ value: `${assignedTo.id}:inverse`, label: 'holds', otherKind: 'asset' }
		]);
	});
});
