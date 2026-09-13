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
import { RECORD_KINDS, recordHref, recordTerms } from '$lib/crm/records';
import type { Database } from '$lib/database.types';
import type { TermsMap } from '$lib/features/terms';
import { term, type Vocabulary } from '$lib/features/vocabulary';
import { getDisplayNames } from '../profiles';
import { listRecordNames, type CanOpen } from './records';
import { listOrgRelationships } from './relationships';

/**
 * The relationship graph, read whole — what the graph page draws.
 *
 * The map is **every record the reader may open**, not only the ones that
 * stand in a relationship: an unrelated record is a dot on its own that
 * still opens its page, so the graph is a way into the data rather than a
 * picture of the relationships alone, and a record joins the map by
 * existing. The `relationships` rows are the lines between those dots.
 *
 * Naming follows the same two namers the Relationships card uses, so a node
 * is named and linked exactly as the record page would name it: records
 * through `listRecordNames()` (their own list modules, the same strings
 * `getRecord()` puts at the top of a record), members through
 * `getDisplayNames()`. A kind the reader may not open is not fetched at all
 * and nothing about it is leaked; a member is on the map only where a
 * relationship names one, because the roster — not this page — is where
 * people who work here are read. An edge whose either end went unnamed goes
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
	const kinds = RECORD_KINDS.filter((kind) => canOpen(kind));
	const [rows, ...listed] = await Promise.all([
		listOrgRelationships(supabase, orgId),
		...kinds.map((kind) => listRecordNames(supabase, orgId, kind))
	]);

	// Every record of every kind on the map, in the order the kinds are
	// registered — so the legend and the map read the same way on every load.
	const nodes: GraphNode[] = kinds.flatMap((kind, index) =>
		(listed[index] ?? []).map((record): GraphNode => ({
			id: graphNodeId(kind, record.id),
			kind,
			name: record.name,
			href: recordHref(kind, record.id)
		}))
	);

	// Members join the map only where a relationship names one.
	const memberIds = new Set(
		rows.flatMap((row) => [
			...(row.from_type === 'member' ? [row.from_id] : []),
			...(row.to_type === 'member' ? [row.to_id] : [])
		])
	);
	const people = await getDisplayNames(supabase, [...memberIds]);
	for (const [id, name] of people) {
		nodes.push({ id: graphNodeId('member', id), kind: 'member', name, href: null });
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
