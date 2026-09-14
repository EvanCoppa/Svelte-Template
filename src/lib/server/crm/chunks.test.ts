import { describe, expect, it } from 'vitest';
import type { Chunk } from '$lib/ai/chunks';
import { hashContent, indexChunks, indexDocument, toVector } from './chunks';
import { ORG_ID, supabaseMockSequence } from './test-support';

/**
 * The write half of retrieval: passages in, rows out. Nothing here calls a
 * model, which is the point — indexing a page must work with no AI provider
 * configured at all.
 *
 * `indexChunks` runs its queries in order — read the hashes, upsert what
 * changed, delete what fell off the end — so the sequence double gives each
 * its own result. When nothing changed there is no upsert, and the sequence
 * is two queries rather than three.
 */

const DOC_ID = '40000000-0000-0000-0000-000000000001';
const entity = { entityType: 'document' as const, entityId: DOC_ID };

const chunk = (index: number, content: string): Chunk => ({ index, heading: null, content });

describe('hashContent', () => {
	it('is stable for the same text and different for different text', async () => {
		expect(await hashContent('one')).toBe(await hashContent('one'));
		expect(await hashContent('one')).not.toBe(await hashContent('two'));
	});

	it('is a hex sha-256, which is what the column is sized for', async () => {
		expect(await hashContent('one')).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('toVector', () => {
	it('sends a vector the way PostgREST reads one', () => {
		expect(toVector([0.5, -0.25])).toBe('[0.5,-0.25]');
	});
});

describe('indexChunks', () => {
	it('writes every passage of a page nothing has indexed yet', async () => {
		const db = supabaseMockSequence([{ data: [] }, { data: [{ id: 'c1' }] }, { data: [] }]);

		const result = await indexChunks(db.supabase, ORG_ID, entity, [
			chunk(0, 'The north elevation needs new flashing.')
		]);

		expect(result).toEqual({ written: 1, removed: 0 });
		expect(db.builder.upsert).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					org_id: ORG_ID,
					entity_type: 'document',
					entity_id: DOC_ID,
					chunk_index: 0,
					content: 'The north elevation needs new flashing.',
					// A fresh passage has no vector — that is the top-up pass's job.
					embedding: null,
					embedding_model: null,
					embedded_at: null
				})
			],
			{ onConflict: 'org_id,entity_type,entity_id,chunk_index' }
		);
	});

	it('leaves an unchanged passage completely alone, vector included', async () => {
		const content = 'The south slope is in good condition.';
		const db = supabaseMockSequence([
			{ data: [{ chunk_index: 0, content_hash: await hashContent(content) }] },
			{ data: [] }
		]);

		const result = await indexChunks(db.supabase, ORG_ID, entity, [chunk(0, content)]);

		// The whole point: editing paragraph three must not re-embed the page.
		expect(result).toEqual({ written: 0, removed: 0 });
		expect(db.builder.upsert).not.toHaveBeenCalled();
	});

	it('rewrites only the passage whose words changed', async () => {
		const kept = 'Surveyed on Tuesday.';
		const db = supabaseMockSequence([
			{
				data: [
					{ chunk_index: 0, content_hash: await hashContent(kept) },
					{ chunk_index: 1, content_hash: await hashContent('The old second paragraph.') }
				]
			},
			{ data: [{ id: 'c2' }] },
			{ data: [] }
		]);

		const result = await indexChunks(db.supabase, ORG_ID, entity, [
			chunk(0, kept),
			chunk(1, 'The new second paragraph.')
		]);

		expect(result.written).toBe(1);
		expect(db.builder.upsert).toHaveBeenCalledWith(
			[expect.objectContaining({ chunk_index: 1, content: 'The new second paragraph.' })],
			expect.anything()
		);
	});

	it('deletes the passages a shortened page no longer has', async () => {
		const only = 'All that is left.';
		// Two queries, not three: nothing changed, so there is no upsert
		// between the hash read and the delete.
		const db = supabaseMockSequence([
			{ data: [{ chunk_index: 0, content_hash: await hashContent(only) }] },
			{ data: [{ id: 'gone-1' }, { id: 'gone-2' }] }
		]);

		const result = await indexChunks(db.supabase, ORG_ID, entity, [chunk(0, only)]);

		expect(result.removed).toBe(2);
		// Everything from the new length onwards — a page that got shorter must
		// not keep answering with text it no longer contains.
		expect(db.builder.gte).toHaveBeenCalledWith('chunk_index', 1);
	});

	it('clears a page emptied of everything', async () => {
		const db = supabaseMockSequence([
			{ data: [{ chunk_index: 0, content_hash: 'whatever' }] },
			{ data: [{ id: 'gone' }] }
		]);

		const result = await indexChunks(db.supabase, ORG_ID, entity, []);

		expect(result).toEqual({ written: 0, removed: 1 });
		expect(db.builder.gte).toHaveBeenCalledWith('chunk_index', 0);
	});
});

describe('indexDocument', () => {
	it('cuts a page up and stores it under its own id', async () => {
		const db = supabaseMockSequence([{ data: [] }, { data: [{ id: 'c1' }] }, { data: [] }]);

		await indexDocument(db.supabase, ORG_ID, {
			id: DOC_ID,
			title: 'Roof survey',
			body: { version: 1, blocks: [{ type: 'paragraph', data: { text: 'Flashing has failed.' } }] }
		});

		expect(db.builder.upsert).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					entity_type: 'document',
					entity_id: DOC_ID,
					// The page's name leads the passage, so a hit quoted alone
					// still says which page it is from.
					content: 'Roof survey\n\nFlashing has failed.'
				})
			],
			expect.anything()
		);
	});

	it('stores nothing for a page with no words in it', async () => {
		const db = supabaseMockSequence([{ data: [] }, { data: [] }]);

		const result = await indexDocument(db.supabase, ORG_ID, {
			id: DOC_ID,
			// The column is not-null with an empty default, so an untitled page
			// is a blank string rather than null.
			title: '',
			body: { version: 1, blocks: [] }
		});

		expect(result).toEqual({ written: 0, removed: 0 });
		expect(db.builder.upsert).not.toHaveBeenCalled();
	});
});
