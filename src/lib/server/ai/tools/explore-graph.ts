import { tool } from 'ai';
import { z } from 'zod';
import { graphNodeId } from '$lib/crm/graph';
import { isRecordKind, RECORD_KINDS, type RecordKind } from '$lib/crm/records';
import type { CrmEntityRef, CrmEntityType } from '$lib/server/crm/entity';
import { listRecordNames } from '$lib/server/crm/records';
import { listOrgRelationships, type RelationshipWithType } from '$lib/server/crm/relationships';
import { getDisplayNames } from '$lib/server/profiles';
import { toolContextSchema } from '../context';
import { canOpenFor, recordAccess, requireToolContext, type ToolAccess } from './access';
import { recordKindSchema } from './record-ref';

/**
 * The graph read whole is the `graph` feature (the page at /graph), so
 * walking it takes that feature — plus, per call, the kind of the record
 * the walk starts from.
 */
export const exploreGraphAccess: ToolAccess = { feature: 'graph', level: 'read' };

/** How far a walk may go, and how many records it may collect before it stops. */
const MAX_DEPTH = 3;
const MAX_NODES = 40;

const nodeKindSchema = z.enum([...RECORD_KINDS, 'member']);

const nodeSchema = z.object({
	/** `<kind>:<id>`, the key the edges use. */
	id: z.string(),
	kind: nodeKindSchema.describe('A record kind, or "member" for someone who works here.'),
	recordId: z.string().describe('The record id (for member, the user id).'),
	name: z.string(),
	/** Hops from the starting record; 0 is the record itself. */
	depth: z.number().int()
});

const edgeSchema = z.object({
	id: z.string(),
	from: z.string().describe('A node id.'),
	to: z.string().describe('A node id.'),
	/** The relationship read from `from` to `to`: "<from> owns <to>". */
	label: z.string(),
	/** The same relationship read the other way: "<to> owned by <from>". */
	inverseLabel: z.string(),
	typeId: z.string(),
	ended: z.boolean()
});

export const exploreGraph = tool({
	description:
		'Walk the relationship graph outward from one record: every record and member it is ' +
		'connected to, and what they connect to in turn, up to `depth` hops — the whole ' +
		'neighbourhood in one call, for questions like who is connected to whom, what a ' +
		'person is linked to across kinds, or which records share a connection. Edges are ' +
		'labelled ("owns", "assigned to"); read them from `from` to `to`. Use getRecord for ' +
		'the details of any node.',
	inputSchema: z.object({
		kind: recordKindSchema,
		id: z.guid().describe('The record to start from.'),
		depth: z
			.number()
			.int()
			.min(1)
			.max(MAX_DEPTH)
			.default(2)
			.describe('How many hops to follow, 1 to 3. Default 2.'),
		includeEnded: z
			.boolean()
			.default(false)
			.describe('Also follow relationships that have ended (history). Default false.')
	}),
	outputSchema: z.object({
		found: z.boolean(),
		nodes: z.array(nodeSchema),
		edges: z.array(edgeSchema),
		/** True when the walk stopped at the node cap before running out of graph. */
		truncated: z.boolean()
	}),
	contextSchema: toolContextSchema,
	execute: async ({ kind, id, depth, includeEnded }, { context }) => {
		requireToolContext(context, exploreGraphAccess);
		const { supabase, orgId, org } = requireToolContext(context, recordAccess(kind, 'read'));
		const canOpen = canOpenFor(org);

		const rows = await listOrgRelationships(supabase, orgId, { openOnly: !includeEnded });
		// A kind the caller may not open is never entered: the walk does not
		// pass through it, nothing beyond it is reached through it, and
		// nothing about it is leaked. A member takes no grant (the roster's rule).
		const walk = walkFrom(
			rows,
			{ entityType: kind, entityId: id },
			depth,
			(other) => other === 'member' || canOpen(other)
		);

		// Name what was reached — the two namers the graph page uses.
		const kinds = RECORD_KINDS.filter((other) => walk.visited.some((node) => node.kind === other));
		const memberIds = walk.visited.flatMap((node) =>
			node.kind === 'member' ? [node.recordId] : []
		);
		const [people, ...listed] = await Promise.all([
			getDisplayNames(supabase, memberIds),
			...kinds.map((other) => listRecordNames(supabase, orgId, other))
		]);
		const names = new Map<string, string>();
		kinds.forEach((other, index) => {
			for (const record of listed[index] ?? [])
				names.set(graphNodeId(other, record.id), record.name);
		});
		for (const [userId, name] of people) names.set(graphNodeId('member', userId), name);

		const nodes = walk.visited.flatMap((node) => {
			const name = names.get(node.id);
			return name ? [{ ...node, name }] : [];
		});
		const start = graphNodeId(kind, id);
		if (!nodes.some((node) => node.id === start)) {
			return { found: false, nodes: [], edges: [], truncated: false };
		}

		const drawn = new Set(nodes.map((node) => node.id));
		const edges = walk.rows.flatMap((row) => {
			const from = graphNodeId(row.from_type, row.from_id);
			const to = graphNodeId(row.to_type, row.to_id);
			if (!drawn.has(from) || !drawn.has(to)) return [];
			return [
				{
					id: row.id,
					from,
					to,
					label: row.relationship_types.forward_label,
					inverseLabel: row.relationship_types.inverse_label,
					typeId: row.relationship_types.id,
					ended: row.ended_on !== null
				}
			];
		});

		return { found: true, nodes, edges, truncated: walk.truncated };
	}
});

type WalkNode = { id: string; kind: RecordKind | 'member'; recordId: string; depth: number };

/** What a walk reached: the nodes in the order found, the rows between them, and whether it hit the cap. */
type Walk = { visited: WalkNode[]; rows: RelationshipWithType[]; truncated: boolean };

function nodeOf(type: CrmEntityType, entityId: string, depth: number): WalkNode | null {
	// `proposal_option` has no page and no name of its own; the walk does not
	// pass through one.
	if (type !== 'member' && !isRecordKind(type)) return null;
	return { id: graphNodeId(type, entityId), kind: type, recordId: entityId, depth };
}

/**
 * A breadth-first walk over the org's relationships, pure so a test can hand
 * it rows: the nodes reached within `depth` hops of `start`, in the order
 * they were reached, and the rows between them. `canEnter` says which kinds
 * the walk may step onto. Stops at the node cap and says so, so a hub with
 * hundreds of links comes back as a sample rather than a wall.
 */
export function walkFrom(
	rows: readonly RelationshipWithType[],
	start: CrmEntityRef,
	depth: number,
	canEnter: (kind: RecordKind | 'member') => boolean
): Walk {
	const adjacency = new Map<string, RelationshipWithType[]>();
	for (const row of rows) {
		for (const key of [
			graphNodeId(row.from_type, row.from_id),
			graphNodeId(row.to_type, row.to_id)
		]) {
			adjacency.set(key, [...(adjacency.get(key) ?? []), row]);
		}
	}

	const origin = nodeOf(start.entityType, start.entityId, 0);
	if (!origin || !canEnter(origin.kind)) return { visited: [], rows: [], truncated: false };

	const visited = new Map<string, WalkNode>([[origin.id, origin]]);
	const used = new Map<string, RelationshipWithType>();
	const queue: WalkNode[] = [origin];
	let truncated = false;

	while (queue.length > 0) {
		const node = queue.shift();
		if (!node || node.depth >= depth) continue;
		for (const row of adjacency.get(node.id) ?? []) {
			const otherEnd =
				graphNodeId(row.from_type, row.from_id) === node.id
					? nodeOf(row.to_type, row.to_id, node.depth + 1)
					: nodeOf(row.from_type, row.from_id, node.depth + 1);
			if (!otherEnd || !canEnter(otherEnd.kind)) continue;
			if (!visited.has(otherEnd.id)) {
				if (visited.size >= MAX_NODES) {
					truncated = true;
					continue;
				}
				visited.set(otherEnd.id, otherEnd);
				queue.push(otherEnd);
			}
			used.set(row.id, row);
		}
	}

	// Only rows whose both ends were reached: a row to a node the cap left out
	// would be a line to nothing.
	return {
		visited: [...visited.values()],
		rows: [...used.values()].filter(
			(row) =>
				visited.has(graphNodeId(row.from_type, row.from_id)) &&
				visited.has(graphNodeId(row.to_type, row.to_id))
		),
		truncated
	};
}
