import { MockEmbeddingModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { ORG_ID, supabaseTablesMock } from '$lib/server/crm/test-support';
import { embedPending, searchContent } from './retrieval';

/**
 * Retrieval, driven with a real embedding model double rather than by mocking
 * the module out from under it — the same way the endpoint test drives the
 * real agent with `MockLanguageModelV4`.
 *
 * The behaviours that matter here are the ones that decide whether a question
 * gets answered at all: no provider still searches, a provider that fails
 * still searches, and a save never waits for either.
 */

const CONFIGURED = { OPENAI_API_KEY: 'test-key' };
const UNCONFIGURED = {};

/** A model that answers with a fixed vector per value, and counts its calls. */
function mockEmbeddings(vector: number[] = [1, 0, 0]) {
	const doEmbed = vi.fn(async ({ values }: { values: string[] }) => ({
		embeddings: values.map(() => vector),
		usage: { tokens: values.length }
	}));
	// SAFETY: `doEmbed`'s call options carry more than `values`, and the double
	// only reads that one field; the cast states what the test supplies.
	// `maxEmbeddingsPerCall` so a batch stays one call, as a real embedding
	// model's does — the mock's default is one value per call.
	const model = new MockEmbeddingModelV4({ doEmbed, maxEmbeddingsPerCall: 100 } as never);
	return { model, doEmbed };
}

const DOC_ID = '40000000-0000-0000-0000-000000000001';

/** A row the text search returns: the select asks for no similarity. */
const textRow = {
	entity_type: 'document' as const,
	entity_id: DOC_ID,
	chunk_index: 0,
	content: 'Roof survey\n\nThe flashing has failed.'
};

/** A row the match function returns: the same passage, with how near it was. */
const hit = { ...textRow, similarity: 0.82 };

describe('searchContent', () => {
	it('answers from the words themselves when no provider is configured', async () => {
		const db = supabaseTablesMock({ content_chunks: { data: [textRow] } });

		const result = await searchContent(db.supabase, ORG_ID, 'flashing', { env: UNCONFIGURED });

		expect(result.mode).toBe('text');
		expect(result.hits).toEqual([
			{
				entityType: 'document',
				entityId: DOC_ID,
				chunkIndex: 0,
				content: textRow.content,
				// Nothing was compared by meaning, so there is no similarity to
				// report — and the tool says so rather than implying one.
				similarity: null
			}
		]);
		expect(db.builders.content_chunks.textSearch).toHaveBeenCalledWith('search_text', 'flashing', {
			type: 'websearch'
		});
	});

	it('answers by meaning when a provider is configured', async () => {
		const { model, doEmbed } = mockEmbeddings();
		const db = supabaseTablesMock(
			{ content_chunks: { data: [] } },
			{ match_content_chunks: { data: [hit] } }
		);

		const result = await searchContent(db.supabase, ORG_ID, 'what did we find on the roof?', {
			env: CONFIGURED,
			model
		});

		expect(result.mode).toBe('vector');
		expect(result.hits[0]?.similarity).toBe(0.82);
		expect(db.rpc).toHaveBeenCalledWith(
			'match_content_chunks',
			expect.objectContaining({ match_org: ORG_ID, query_embedding: '[1,0,0]' })
		);
		expect(doEmbed).toHaveBeenCalled();
	});

	it('narrows to the kinds it was asked for', async () => {
		const { model } = mockEmbeddings();
		const db = supabaseTablesMock(
			{ content_chunks: { data: [] } },
			{ match_content_chunks: { data: [hit] } }
		);

		await searchContent(db.supabase, ORG_ID, 'roof', {
			env: CONFIGURED,
			model,
			kinds: ['document']
		});

		expect(db.rpc).toHaveBeenCalledWith(
			'match_content_chunks',
			expect.objectContaining({ match_kinds: ['document'] })
		);
	});

	it('falls back to the words when meaning finds nothing', async () => {
		const { model } = mockEmbeddings();
		const db = supabaseTablesMock(
			{ content_chunks: { data: [textRow] } },
			{ match_content_chunks: { data: [] } }
		);

		const result = await searchContent(db.supabase, ORG_ID, 'MID 4471', {
			env: CONFIGURED,
			model
		});

		// An exact word is often the right answer for a code, and always a
		// better answer than none.
		expect(result.mode).toBe('text');
		expect(result.hits).toHaveLength(1);
	});

	it('falls back to the words when the provider fails, rather than erroring', async () => {
		const model = new MockEmbeddingModelV4({
			doEmbed: async () => {
				throw new Error('provider down');
			}
		});
		const db = supabaseTablesMock({ content_chunks: { data: [textRow] } });

		const result = await searchContent(db.supabase, ORG_ID, 'flashing', {
			env: CONFIGURED,
			model
		});

		expect(result.mode).toBe('text');
		expect(result.hits).toHaveLength(1);
	});

	it('asks nothing at all for a blank question', async () => {
		const db = supabaseTablesMock({ content_chunks: { data: [textRow] } });

		expect(await searchContent(db.supabase, ORG_ID, '   ', { env: CONFIGURED })).toEqual({
			hits: [],
			mode: 'text'
		});
		expect(db.from).not.toHaveBeenCalled();
	});
});

describe('embedPending', () => {
	it('does nothing when no provider is configured — a save never waits for one', async () => {
		const db = supabaseTablesMock({ content_chunks: { data: [{ id: 'c1', content: 'words' }] } });

		expect(await embedPending(db.supabase, ORG_ID, { env: UNCONFIGURED })).toBe(0);
		expect(db.from).not.toHaveBeenCalled();
	});

	it('fills in the vectors of the passages waiting for one', async () => {
		const { model, doEmbed } = mockEmbeddings([0.5, 0.5, 0]);
		const db = supabaseTablesMock({
			content_chunks: {
				data: [
					{ id: 'c1', content: 'first' },
					{ id: 'c2', content: 'second' }
				]
			}
		});

		expect(await embedPending(db.supabase, ORG_ID, { env: CONFIGURED, model })).toBe(2);
		expect(doEmbed).toHaveBeenCalledTimes(1);
		expect(db.builders.content_chunks.is).toHaveBeenCalledWith('embedding', null);
		expect(db.builders.content_chunks.update).toHaveBeenCalledWith(
			expect.objectContaining({
				embedding: '[0.5,0.5,0]',
				embedding_model: 'text-embedding-3-small'
			})
		);
	});

	it('leaves the rows pending when the provider fails', async () => {
		const model = new MockEmbeddingModelV4({
			doEmbed: async () => {
				throw new Error('provider down');
			}
		});
		const db = supabaseTablesMock({ content_chunks: { data: [{ id: 'c1', content: 'words' }] } });

		// Still pending, so the next question tries again — the index heals
		// itself with nothing scheduled to do it.
		expect(await embedPending(db.supabase, ORG_ID, { env: CONFIGURED, model })).toBe(0);
		expect(db.builders.content_chunks.update).not.toHaveBeenCalled();
	});

	it('stops early when nothing is waiting', async () => {
		const { model, doEmbed } = mockEmbeddings();
		const db = supabaseTablesMock({ content_chunks: { data: [] } });

		expect(await embedPending(db.supabase, ORG_ID, { env: CONFIGURED, model })).toBe(0);
		expect(doEmbed).not.toHaveBeenCalled();
	});
});
