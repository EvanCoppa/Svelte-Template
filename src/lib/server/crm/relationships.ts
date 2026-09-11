import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { Vocabulary } from '$lib/features/vocabulary';
import { getDisplayNames } from '../profiles';
import type { CrmEntityRef, CrmEntityType } from './entity';
import { recordLinks } from './links';
import type { CanOpen } from './records';
import { unwrap, unwrapDeleted } from './unwrap';

/**
 * The relationship graph — data access for `relationships` and
 * `relationship_types` (the relationships migration), and the one place a
 * row becomes something a screen can draw.
 *
 * A relationship is one row between two CRM records of any kind, typed by a
 * `relationship_types` row that carries a forward label ("owns") and an
 * inverse one ("owned by"). The row is stored once; which label applies
 * depends on which record you are looking at. `getRelationships()` does
 * that orientation for every caller, so a page asks for a record's
 * relationships and gets back the other record, already named and linked,
 * with the label that reads correctly from where the reader stands —
 * nothing reconstructs an inverse by hand.
 *
 * Endpoints are the shared entity link (`./entity`): `(entity_type,
 * entity_id)`, which is what lets a company, a contact, an asset, an
 * employee (the 'member' kind, keyed by user id) or a kind added later all
 * take part with no change here. The other record is named the way every
 * link is — `recordLinks()`, hence `getRecord()`, the app's one namer — and
 * a kind the reader may not open is left out entirely, the record page's
 * rule for a related group. A member is the exception: named through
 * `getDisplayNames()` whatever the reader's staff grant (as the page names
 * an author or an assignee), and with no page — the roster is where people
 * who work here are read.
 *
 * Same contract as the other modules: request-scoped client + active org
 * id, RLS deciding what exists, write params Picked to the granted columns.
 * Cross-org endpoints, a type from another org and a kind the type does not
 * accept are all refused by the database's own trigger, so a caller sees
 * the same PostgREST error a missing foreign key would raise.
 */

export type RelationshipType = Tables<'relationship_types'>;
export type Relationship = Tables<'relationships'>;
export type RelationshipWithType = Relationship & { relationship_types: RelationshipType };

/** Which side of the row the record on screen stands on. */
export type RelationshipDirection = 'forward' | 'inverse';

/** The record at the other end: named, and linked when the reader may open it. */
export type RelatedEntity = {
	entityType: CrmEntityType;
	entityId: string;
	name: string;
	href: string | null;
};

/** One relationship as seen from one record — what a page draws. */
export type RelationshipView = {
	id: string;
	type: Pick<RelationshipType, 'id' | 'key'>;
	direction: RelationshipDirection;
	/** The type's forward or inverse label, whichever reads from this record. */
	label: string;
	other: RelatedEntity;
	startedOn: string | null;
	endedOn: string | null;
	notes: string | null;
	createdAt: string;
};

type RelationshipColumn = 'started_on' | 'ended_on' | 'notes';

const sameEntity = (kind: CrmEntityType, id: string, entity: CrmEntityRef) =>
	kind === entity.entityType && id === entity.entityId;

/**
 * The relationship types this org may use: the system ones and its own,
 * by forward label. The insert trigger refuses any other, so a picker built
 * from this list can never offer a type the database would reject.
 */
export async function listRelationshipTypes(
	supabase: SupabaseClient<Database>,
	orgId: string
): Promise<RelationshipType[]> {
	return unwrap(
		await supabase
			.from('relationship_types')
			.select('*')
			.or(`org_id.is.null,org_id.eq.${orgId}`)
			.order('forward_label')
	);
}

/**
 * Every relationship a record stands in, from either side, newest first,
 * with its type embedded. Ended ones are history and are included unless
 * `openOnly` says otherwise; `typeId` narrows to one kind of relationship.
 */
export async function listRelationships(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	filter: { typeId?: string; openOnly?: boolean } = {}
): Promise<RelationshipWithType[]> {
	let query = supabase
		.from('relationships')
		.select('*, relationship_types(*)')
		.eq('org_id', orgId)
		.or(
			`and(from_type.eq.${entity.entityType},from_id.eq.${entity.entityId}),` +
				`and(to_type.eq.${entity.entityType},to_id.eq.${entity.entityId})`
		)
		.order('created_at', { ascending: false });
	if (filter.typeId) query = query.eq('relationship_type_id', filter.typeId);
	if (filter.openOnly) query = query.is('ended_on', null);
	return unwrap(await query);
}

/**
 * A row read from one record's side: which direction it runs, the label
 * that reads from there, and the record at the other end (not yet named).
 * Pure, so a test can hand it a row. A row from a record to itself reads
 * forward.
 */
export function orientRelationship(
	row: RelationshipWithType,
	entity: CrmEntityRef
): Pick<RelationshipView, 'direction' | 'label'> & { other: CrmEntityRef } {
	const forward = sameEntity(row.from_type, row.from_id, entity);
	return forward
		? {
				direction: 'forward',
				label: row.relationship_types.forward_label,
				other: { entityType: row.to_type, entityId: row.to_id }
			}
		: {
				direction: 'inverse',
				label: row.relationship_types.inverse_label,
				other: { entityType: row.from_type, entityId: row.from_id }
			};
}

/**
 * A record's relationships as a page draws them: oriented, labelled and
 * with the other record named and linked. A relationship whose other end
 * is a kind the reader may not open is omitted, not shown unlinked —
 * nothing is leaked about a record they cannot see. One whose other end
 * has vanished (RLS, or a race with a delete) is omitted the same way.
 */
export async function getRelationships(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	canOpen: CanOpen,
	vocabulary: Vocabulary,
	filter: { typeId?: string; openOnly?: boolean } = {}
): Promise<RelationshipView[]> {
	const rows = await listRelationships(supabase, orgId, entity, filter);
	const oriented = rows.map((row) => ({ row, ...orientRelationship(row, entity) }));

	// Two namers, both the app's existing ones: records through the link
	// resolver, members through the profiles they share an org with.
	const [links, people] = await Promise.all([
		recordLinks(
			supabase,
			orgId,
			oriented.map(({ row, other }) => ({
				id: row.id,
				entity_type: other.entityType,
				entity_id: other.entityId
			})),
			canOpen,
			vocabulary
		),
		getDisplayNames(
			supabase,
			oriented.flatMap(({ other }) => (other.entityType === 'member' ? [other.entityId] : []))
		)
	]);

	return oriented.flatMap(({ row, direction, label, other }): RelationshipView[] => {
		const named = nameEntity(other, links[row.id], people);
		if (!named) return [];
		return [
			{
				id: row.id,
				type: { id: row.relationship_types.id, key: row.relationship_types.key },
				direction,
				label,
				other: named,
				startedOn: row.started_on,
				endedOn: row.ended_on,
				notes: row.notes,
				createdAt: row.created_at
			}
		];
	});
}

function nameEntity(
	other: CrmEntityRef,
	link: { label: string; href: string } | undefined,
	people: ReadonlyMap<string, string>
): RelatedEntity | null {
	if (other.entityType === 'member') {
		const name = people.get(other.entityId);
		return name ? { ...other, name, href: null } : null;
	}
	// `recordLinks()` already dropped kinds with no page and kinds the reader
	// may not open, so no link means no row.
	if (!link) return null;
	return { ...other, name: link.label, href: link.href };
}

/**
 * Draws one relationship. `from` and `to` are the two records as the type's
 * labels read them — "<from> works at <to>" — and the database checks that
 * both exist in this org and fit the type before the row lands.
 */
export async function createRelationship(
	supabase: SupabaseClient<Database>,
	orgId: string,
	values: {
		typeId: string;
		from: CrmEntityRef;
		to: CrmEntityRef;
	} & Partial<Pick<TablesInsert<'relationships'>, RelationshipColumn>>
): Promise<Relationship> {
	const { typeId, from, to, ...rest } = values;
	return unwrap(
		await supabase
			.from('relationships')
			.insert({
				...rest,
				org_id: orgId,
				relationship_type_id: typeId,
				from_type: from.entityType,
				from_id: from.entityId,
				to_type: to.entityType,
				to_id: to.entityId
			})
			.select()
			.single()
	);
}

/**
 * Corrects when a relationship held, or the note on it. The endpoints and
 * the type are not editable: re-pointing one is a remove and a create, so
 * the uniqueness rule always sees a whole row.
 */
export async function updateRelationship(
	supabase: SupabaseClient<Database>,
	orgId: string,
	relationshipId: string,
	values: Pick<TablesUpdate<'relationships'>, RelationshipColumn>
): Promise<Relationship> {
	return unwrap(
		await supabase
			.from('relationships')
			.update(values)
			.eq('org_id', orgId)
			.eq('id', relationshipId)
			.select()
			.single()
	);
}

/** Removes a relationship outright; ending one (`ended_on`) keeps the history. */
export async function removeRelationship(
	supabase: SupabaseClient<Database>,
	orgId: string,
	relationshipId: string
): Promise<void> {
	unwrapDeleted(
		await supabase
			.from('relationships')
			.delete()
			.eq('org_id', orgId)
			.eq('id', relationshipId)
			.select('id'),
		'Relationship'
	);
}
