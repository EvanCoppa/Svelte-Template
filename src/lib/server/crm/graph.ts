import type { SupabaseClient } from '@supabase/supabase-js';
import {
	graphNodeId,
	type GraphData,
	type GraphEdge,
	type GraphEdgeType,
	type GraphKind,
	type GraphNode,
	type GraphNodeKind
} from '$lib/crm/graph';
import { RECORD_KINDS, recordTerms, type RecordKind } from '$lib/crm/records';
import type { Database } from '$lib/database.types';
import type { TermsMap } from '$lib/features/terms';
import { term, type Vocabulary } from '$lib/features/vocabulary';
import { getDisplayNames } from '../profiles';
import type { CrmEntityRef, CrmEntityType } from './entity';
import { recordLinks } from './links';
import type { CanOpen } from './records';
import { listOrgRelationships } from './relationships';

/**
 * The relationship graph, read whole — what the graph page draws.
 *
 * The Relationships card reads the graph one record at a time
 * (`getRelationships()`); this reads every relationship in the org and
 * folds the endpoints into nodes and the rows into edges. Naming follows
 * the same two namers that card uses, so a node is named and linked
 * exactly as the record page would name it: records through
 * `recordLinks()` (hence `getRecord()`, the app's one namer, which is also
 * where the feature gate applies — a kind the reader may not open is not
 * fetched and not on the map, and nothing is leaked about it), members
 * through `getDisplayNames()`. An edge whose either end went unnamed goes
 * with it; the map never shows a line to nothing.
 *
 * The legend is folded here too, because its words are the server's to
 * know: a kind of record is named by its feature's terms as the org's
 * industry says them ("Patients" in a practice, "Merchants" in merchant
 * services), the member kind by the `graph_member` term, and an edge type
 * by its forward label. So the same page serves every industry — whatever
 * kinds an industry's features draw, and whatever the org's relationship
 * types are, that is the legend.
 */
export async function describeGraph(
	supabase: SupabaseClient<Database>,
	orgId: string,
	canOpen: CanOpen,
	vocabulary: Vocabulary,
	terms: TermsMap
): Promise<GraphData> {
	const rows = await listOrgRelationships(supabase, orgId);

	// Every endpoint once, keyed as the node will be.
	const endpoints = new Map<string, CrmEntityRef>();
	for (const row of rows) {
		endpoints.set(graphNodeId(row.from_type, row.from_id), {
			entityType: row.from_type,
			entityId: row.from_id
		});
		endpoints.set(graphNodeId(row.to_type, row.to_id), {
			entityType: row.to_type,
			entityId: row.to_id
		});
	}

	const [links, people] = await Promise.all([
		recordLinks(
			supabase,
			orgId,
			[...endpoints].map(([id, ref]) => ({
				id,
				entity_type: ref.entityType,
				entity_id: ref.entityId
			})),
			canOpen,
			vocabulary
		),
		getDisplayNames(
			supabase,
			[...endpoints.values()].flatMap((ref) => (ref.entityType === 'member' ? [ref.entityId] : []))
		)
	]);

	const nodes: GraphNode[] = [];
	for (const [id, ref] of endpoints) {
		const kind = nodeKindOf(ref.entityType);
		if (!kind) continue;
		if (kind === 'member') {
			const name = people.get(ref.entityId);
			if (name) nodes.push({ id, kind, name, href: null });
			continue;
		}
		// `recordLinks()` already dropped kinds with no page and kinds the
		// reader may not open, so no link means no node.
		const link = links[id];
		if (link) nodes.push({ id, kind, name: link.label, href: link.href });
	}
	const drawn = new Set(nodes.map((node) => node.id));

	const edges: GraphEdge[] = rows.flatMap((row): GraphEdge[] => {
		const source = graphNodeId(row.from_type, row.from_id);
		const target = graphNodeId(row.to_type, row.to_id);
		if (!drawn.has(source) || !drawn.has(target)) return [];
		return [
			{
				id: row.id,
				source,
				target,
				typeId: row.relationship_types.id,
				label: row.relationship_types.forward_label,
				inverseLabel: row.relationship_types.inverse_label,
				ended: row.ended_on !== null
			}
		];
	});

	return {
		nodes,
		edges,
		kinds: describeKinds(nodes, vocabulary, terms),
		types: describeTypes(edges)
	};
}

/** The kinds that can be a node: the record kinds with a page, and a member. */
function nodeKindOf(entityType: CrmEntityType): GraphNodeKind | null {
	if (entityType === 'member') return 'member';
	return RECORD_KINDS.find((kind): kind is RecordKind => kind === entityType) ?? null;
}

/**
 * The legend's kinds: every kind with a node on the map, named as the
 * industry names it, in the order the record kinds are registered (members
 * last), so the legend reads the same way on every load.
 */
function describeKinds(
	nodes: readonly GraphNode[],
	vocabulary: Vocabulary,
	terms: TermsMap
): GraphKind[] {
	const counts = new Map<GraphNodeKind, number>();
	for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);

	const order: GraphNodeKind[] = [...RECORD_KINDS, 'member'];
	return order.flatMap((kind): GraphKind[] => {
		const count = counts.get(kind);
		if (!count) return [];
		const label =
			kind === 'member' ? term(vocabulary, 'graph_member') : recordTerms(terms, kind).name;
		return [{ kind, label, count }];
	});
}

/** The legend's relationship types: every type with an edge on the map, by label. */
function describeTypes(edges: readonly GraphEdge[]): GraphEdgeType[] {
	const types = new Map<string, GraphEdgeType>();
	for (const edge of edges) {
		const found = types.get(edge.typeId);
		if (found) found.count += 1;
		else types.set(edge.typeId, { id: edge.typeId, label: edge.label, count: 1 });
	}
	return [...types.values()].sort((a, b) => a.label.localeCompare(b.label));
}
