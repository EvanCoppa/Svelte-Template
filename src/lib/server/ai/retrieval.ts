import { embed, embedMany, type EmbeddingModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import {
	applyEmbeddings,
	listPendingChunks,
	matchChunks,
	searchChunkText,
	type ChunkEntityKind,
	type ChunkHit
} from '$lib/server/crm/chunks';
import {
	embeddingCallOptions,
	embeddingModel,
	embeddingModelId,
	isAiConfigured,
	type AiEnv
} from './provider';

/**
 * Retrieval — turning a question into the passages that answer it.
 *
 * **The write path never embeds.** A save stores the TEXT of every passage
 * that changed (`indexDocument()` in `$lib/server/crm/chunks`) and leaves its
 * vector null; this module tops up what is pending before it searches. Three
 * things fall out of that, and all three are the reason for it:
 *
 *   - typing costs nothing. The editor autosaves every few hundred
 *     milliseconds, and a save that called an embedding API would be a bill
 *     and a latency spike per keystroke burst.
 *   - a save can never fail because a model provider is down. The writing
 *     lands and the index catches up — the same order `saveDocument()`
 *     already uses for the reference index, for the same reason.
 *   - the index is self-healing. After an outage, a key rotation or a model
 *     change, the pending rows are found and filled on the next question.
 *     Nothing has to remember to run, which matters because nothing in this
 *     app runs background work.
 *
 * The cost is that the first question after a big edit pays to embed what
 * changed. It is capped so that stays a pause rather than a hang, and the
 * remainder waits for the question after it.
 *
 * **With no provider configured, retrieval still works.** Passages are stored
 * either way and the search falls back to full text over the same rows.
 */

/**
 * How many pending passages one question will wait for. Two or three is the
 * normal case — the paragraphs somebody just edited. This bounds the cold
 * start: a freshly seeded org, or the first search after a model change.
 */
export const TOP_UP_LIMIT = 32;

/** How a result was found, so a caller can say so rather than implying more than it knows. */
export type SearchMode = 'vector' | 'text';

export type ContentSearch = { hits: ChunkHit[]; mode: SearchMode };

/**
 * What the embedding half of retrieval takes. `model` is injectable for the
 * same reason `createAssistantAgent()` takes its model rather than reaching
 * for `chatModel()`: a test drives the real code with a double instead of
 * mocking the module out from under it.
 */
export type EmbedOptions = {
	env?: AiEnv;
	model?: EmbeddingModel;
	limit?: number;
};

/**
 * Fills in the vectors for passages that have none, oldest first, up to the
 * cap. Returns how many it embedded.
 *
 * Best effort by design: a provider outage leaves the rows pending and the
 * caller searches by text instead. Nothing here throws into a question.
 */
export async function embedPending(
	supabase: SupabaseClient<Database>,
	orgId: string,
	{ env: source, model, limit = TOP_UP_LIMIT }: EmbedOptions = {}
): Promise<number> {
	if (!isAiConfigured(source)) return 0;

	const pending = await listPendingChunks(supabase, orgId, limit);
	if (pending.length === 0) return 0;

	try {
		const { embeddings } = await embedMany({
			model: model ?? embeddingModel(source),
			values: pending.map((row) => row.content),
			providerOptions: embeddingCallOptions()
		});
		await applyEmbeddings(
			supabase,
			pending.flatMap((row, index) => {
				const embedding = embeddings[index];
				return embedding ? [{ id: row.id, embedding }] : [];
			}),
			embeddingModelId(source)
		);
		return pending.length;
	} catch {
		// The rows stay pending and the caller falls back to text. An answer
		// from the words on the page is worse than one from meaning, and
		// infinitely better than an error.
		return 0;
	}
}

/**
 * The passages that answer a question, nearest first.
 *
 * Tops up the pending vectors first, so a question asked straight after an
 * edit sees what was just written rather than the version before it — the
 * property that makes "no background worker" an honest design rather than a
 * gap.
 *
 * Falls back to text when there is no provider, when the query cannot be
 * embedded, or when meaning found nothing at all.
 */
export async function searchContent(
	supabase: SupabaseClient<Database>,
	orgId: string,
	query: string,
	options: {
		kinds?: readonly ChunkEntityKind[];
		limit?: number;
		minSimilarity?: number;
		env?: AiEnv;
		model?: EmbeddingModel;
	} = {}
): Promise<ContentSearch> {
	const { kinds, limit = 8, minSimilarity = 0.15, env: source, model } = options;
	const text = query.trim();
	if (!text) return { hits: [], mode: 'text' };

	if (isAiConfigured(source)) {
		await embedPending(supabase, orgId, { env: source, model });
		try {
			const { embedding } = await embed({
				model: model ?? embeddingModel(source),
				value: text,
				providerOptions: embeddingCallOptions()
			});
			const hits = await matchChunks(supabase, orgId, embedding, {
				kinds,
				limit,
				minSimilarity
			});
			if (hits.length > 0) return { hits, mode: 'vector' };
		} catch {
			// Fall through to text rather than failing the question.
		}
	}

	return { hits: await searchChunkText(supabase, orgId, text, { kinds, limit }), mode: 'text' };
}
