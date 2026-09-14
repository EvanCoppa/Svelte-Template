import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkDocument, type Chunk } from '$lib/ai/chunks';
import type { Database, Enums } from '$lib/database.types';
import type { Document } from './documents';
import type { CrmEntityRef } from './entity';
import { unwrap } from './unwrap';

/**
 * Data access for `content_chunks` — the passages of an org's own writing
 * that retrieval searches.
 *
 * The same contract as every other module here: the request-scoped client
 * plus the active org id, RLS deciding what exists. Nothing in this file
 * calls a model — cutting text up and storing it is ordinary data access, and
 * `$lib/server/ai/retrieval.ts` is the half that embeds and searches. That
 * split is what lets a save index a page with no AI provider configured at
 * all.
 *
 * The rows are DERIVED. Nothing here is a fact a person typed: a chunk is
 * rebuilt from its source whenever the source is saved, and a source that
 * goes takes its passages with it (the content_chunks migration's delete
 * path).
 */

export type ChunkEntityKind = Enums<'crm_entity_type'>;

/** One passage waiting for a vector. */
export type PendingChunk = { id: string; content: string };

/** One passage a search found. `similarity` is null when text answered. */
export type ChunkHit = {
	entityType: ChunkEntityKind;
	entityId: string;
	chunkIndex: number;
	content: string;
	similarity: number | null;
};

/**
 * The hash that decides whether a passage needs embedding again.
 *
 * SHA-256 through the Web Crypto API rather than `node:crypto`, so it runs
 * unchanged wherever the app is deployed. A content address, not a secret:
 * the only property that matters is that different text hashes differently.
 */
export async function hashContent(content: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A vector as PostgREST wants it: the JSON array, as text. */
export function toVector(embedding: readonly number[]): string {
	return JSON.stringify(embedding);
}

/**
 * Rewrites one record's passages to exactly these chunks.
 *
 * Reads the existing hashes first, so an unchanged passage is left completely
 * alone — including its vector. That is what makes editing one paragraph of a
 * forty-paragraph page cost one embedding rather than forty, and it is the
 * whole reason the hash is a column rather than something recomputed.
 *
 * Passages past the end of the new list are deleted: a page that got shorter
 * must not keep answering with text it no longer contains.
 */
export async function indexChunks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	entity: CrmEntityRef,
	chunks: readonly Chunk[]
): Promise<{ written: number; removed: number }> {
	const existing = unwrap(
		await supabase
			.from('content_chunks')
			.select('chunk_index, content_hash')
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
	);
	const before = new Map(existing.map((row) => [row.chunk_index, row.content_hash]));

	const hashed = await Promise.all(
		chunks.map(async (chunk) => ({ chunk, hash: await hashContent(chunk.content) }))
	);
	const changed = hashed.filter(({ chunk, hash }) => before.get(chunk.index) !== hash);

	if (changed.length > 0) {
		unwrap(
			await supabase
				.from('content_chunks')
				.upsert(
					changed.map(({ chunk, hash }) => ({
						org_id: orgId,
						entity_type: entity.entityType,
						entity_id: entity.entityId,
						chunk_index: chunk.index,
						content: chunk.content,
						content_hash: hash,
						// The text changed, so whatever vector was here describes
						// something else now. Null is "needs embedding", not an error.
						embedding: null,
						embedding_model: null,
						embedded_at: null
					})),
					{ onConflict: 'org_id,entity_type,entity_id,chunk_index' }
				)
				.select('id')
		);
	}

	const removed = unwrap(
		await supabase
			.from('content_chunks')
			.delete()
			.eq('org_id', orgId)
			.eq('entity_type', entity.entityType)
			.eq('entity_id', entity.entityId)
			.gte('chunk_index', chunks.length)
			.select('id')
	);

	return { written: changed.length, removed: removed.length };
}

/**
 * A page's passages, as the chunker cuts them. Documents are the first
 * source; a second kind adds a chunker beside `chunkDocument()` and one call
 * like this one, and needs no migration.
 */
export async function indexDocument(
	supabase: SupabaseClient<Database>,
	orgId: string,
	document: Pick<Document, 'id' | 'title' | 'body'>
): Promise<{ written: number; removed: number }> {
	return indexChunks(
		supabase,
		orgId,
		{ entityType: 'document', entityId: document.id },
		chunkDocument(document.body, document.title)
	);
}

/** Passages with no vector yet, oldest first — what a top-up pass fills in. */
export async function listPendingChunks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	limit: number
): Promise<PendingChunk[]> {
	return unwrap(
		await supabase
			.from('content_chunks')
			.select('id, content')
			.eq('org_id', orgId)
			.is('embedding', null)
			.order('updated_at', { ascending: true })
			.limit(limit)
	);
}

/**
 * Stores the vectors a top-up pass produced.
 *
 * One update per row rather than an upsert, because an upsert has to send
 * every not-null column and the pending read deliberately carries only the id
 * and the text — re-reading whole rows to write one field back would cost
 * more than the updates do. The caller's batch is capped, so this is bounded.
 */
export async function applyEmbeddings(
	supabase: SupabaseClient<Database>,
	rows: readonly { id: string; embedding: readonly number[] }[],
	model: string
): Promise<void> {
	const embeddedAt = new Date().toISOString();
	await Promise.all(
		rows.map((row) =>
			supabase
				.from('content_chunks')
				.update({
					embedding: toVector(row.embedding),
					embedding_model: model,
					embedded_at: embeddedAt
				})
				.eq('id', row.id)
		)
	);
}

function toHits(
	rows: readonly {
		entity_type: ChunkEntityKind;
		entity_id: string;
		chunk_index: number;
		content: string;
		similarity?: number;
	}[]
): ChunkHit[] {
	return rows.map((row) => ({
		entityType: row.entity_type,
		entityId: row.entity_id,
		chunkIndex: row.chunk_index,
		content: row.content,
		similarity: row.similarity ?? null
	}));
}

/** Nearest passages to a query vector — the RPC, because PostgREST has no vector operator. */
export async function matchChunks(
	supabase: SupabaseClient<Database>,
	orgId: string,
	embedding: readonly number[],
	options: { kinds?: readonly ChunkEntityKind[]; limit: number; minSimilarity: number }
): Promise<ChunkHit[]> {
	return toHits(
		unwrap(
			await supabase.rpc('match_content_chunks', {
				query_embedding: toVector(embedding),
				match_org: orgId,
				match_kinds: options.kinds ? [...options.kinds] : undefined,
				match_count: options.limit,
				min_similarity: options.minSimilarity
			})
		)
	);
}

/**
 * Passages matching the words themselves — the fallback when nothing is
 * embedded, and the better answer for a part number or an MID, where an exact
 * word beats a nearby one.
 */
export async function searchChunkText(
	supabase: SupabaseClient<Database>,
	orgId: string,
	query: string,
	options: { kinds?: readonly ChunkEntityKind[]; limit: number }
): Promise<ChunkHit[]> {
	let search = supabase
		.from('content_chunks')
		.select('entity_type, entity_id, chunk_index, content')
		.eq('org_id', orgId);
	if (options.kinds && options.kinds.length > 0)
		search = search.in('entity_type', [...options.kinds]);
	return toHits(
		unwrap(
			await search.textSearch('search_text', query, { type: 'websearch' }).limit(options.limit)
		)
	);
}
