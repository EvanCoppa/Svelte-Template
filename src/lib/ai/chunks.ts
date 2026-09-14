import { z } from 'zod';
import { blockText, documentBody } from '$lib/crm/documents';
import type { Json } from '$lib/database.types';
import type { DocumentBlock } from '$lib/schemas/documents';

/**
 * Cutting writing into passages a model can read.
 *
 * **Deterministic, and a model never does it.** The same line the notes plan
 * draws around arithmetic: an LLM that chunks a document correctly 99% of the
 * time is a worse chunker than a function, and this one is testable in node
 * with no key, no network and no fixture recording.
 *
 * The unit is NOT a block. A block is a paragraph, and a paragraph on its own
 * usually cannot answer anything — "it needs replacing" is useless without
 * knowing what "it" is. So blocks accumulate into passages under a character
 * budget, and every passage carries the heading trail above it, which is what
 * makes it readable alone:
 *
 *     Roof survey › North elevation
 *
 *     The flashing has failed at the parapet. Recommend full replacement
 *     before the next wet season.
 *
 * Two rules do most of the work. A heading always starts a new passage,
 * because that is where the subject changes. And a passage never spans a
 * heading, because the trail printed at its top would be a lie about half of
 * it.
 *
 * There is deliberately no overlap between passages. Overlap exists to stop a
 * sentence being cut in half by an arbitrary boundary — but these boundaries
 * are not arbitrary, they are paragraph and heading breaks the author made,
 * and doubling the size of the index to guard against a break the author
 * chose is a cost with no matching gain here.
 */

/** One passage, ready to embed. */
export type Chunk = {
	/** Its position in the source, so passages can be read back in order. */
	index: number;
	/** The heading trail above it, for the citation to show. Null at the top of a page. */
	heading: string | null;
	/** What the model reads: the trail, then the words. */
	content: string;
};

/**
 * The budget for one passage, in characters.
 *
 * Roughly 300 tokens of English — comfortably inside every embedding model's
 * window, and small enough that a hit points at a paragraph or two rather
 * than at "somewhere on this page". It is a budget, not a limit: a passage is
 * closed BEFORE adding a block that would exceed it, so one long paragraph
 * still travels whole.
 */
export const CHUNK_BUDGET = 1200;

/**
 * The hard cap on one passage, past which a single block is split on sentence
 * boundaries. Only a genuinely enormous paragraph reaches this.
 */
const CHUNK_CEILING = 4000;

/** Below this a passage is not worth an embedding call — a stray word, a stray date. */
const MIN_CHUNK = 8;

/** Blocks that are furniture rather than words. */
const SKIPPED = new Set(['delimiter', 'image']);

/**
 * A heading's depth, decoded rather than inspected. An editor that omits the
 * level, or writes one outside the range, reads as an h2 — the level a
 * `header` block defaults to — instead of failing the chunk.
 */
const levelSchema = z.number().int().min(1).max(6).catch(2);

function headingLevel(block: DocumentBlock): number | null {
	return block.type === 'header' ? levelSchema.parse(block.data.level) : null;
}

/**
 * The trail as one line: "Roof survey › North elevation".
 *
 * The array is indexed BY HEADING LEVEL, so it is sparse — a page whose first
 * heading is an h2 has nothing at index 1. The holes are dropped here rather
 * than filled, because a level nobody used is not a missing step.
 */
function trailOf(trail: readonly (string | undefined)[]): string | null {
	const parts = trail.filter((part): part is string => Boolean(part));
	return parts.length > 0 ? parts.join(' › ') : null;
}

/**
 * One oversized block as several passages, split after sentence ends so a
 * passage never begins mid-clause. Falls back to a hard cut only when a block
 * has no sentence boundary at all (a pasted log, a wall of ids).
 */
function splitLong(text: string): string[] {
	const pieces: string[] = [];
	let rest = text;
	while (rest.length > CHUNK_CEILING) {
		const window = rest.slice(0, CHUNK_CEILING);
		const boundary = Math.max(
			window.lastIndexOf('. '),
			window.lastIndexOf('? '),
			window.lastIndexOf('! ')
		);
		const cut = boundary > CHUNK_CEILING / 2 ? boundary + 1 : CHUNK_CEILING;
		pieces.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut).trim();
	}
	if (rest) pieces.push(rest);
	return pieces;
}

/**
 * A document's body as passages.
 *
 * Reads through `documentBody()`, so a body that cannot be read chunks to
 * nothing rather than throwing — an unreadable page must never be able to
 * fail somebody's save.
 */
export function chunkDocument(body: Json, title?: string | null): Chunk[] {
	const blocks = documentBody(body).blocks;
	const chunks: Chunk[] = [];

	// The page's own name is the root of every trail: a passage quoted out of
	// context still says which page it came from.
	const root = title?.trim() || null;
	// Indexed by heading level, with the page name at 0 — so placing a heading
	// is "truncate to this level, then sit at it", which is what makes a
	// same-level heading REPLACE its sibling instead of nesting under it.
	const trail: (string | undefined)[] = root ? [root] : [];
	let heading: string | null = trailOf(trail);
	let buffer: string[] = [];

	const flush = () => {
		const text = buffer.join('\n\n').trim();
		buffer = [];
		if (text.length < MIN_CHUNK) return;
		for (const piece of splitLong(text)) {
			if (piece.length < MIN_CHUNK) continue;
			chunks.push({
				index: chunks.length,
				heading,
				content: heading ? `${heading}\n\n${piece}` : piece
			});
		}
	};

	for (const block of blocks) {
		if (SKIPPED.has(block.type)) continue;
		const text = blockText(block);
		if (!text) continue;

		const level = headingLevel(block);
		if (level !== null) {
			// The subject changes here, so whatever was being collected ends.
			flush();
			// Drop every heading at this level or deeper, then sit at this one.
			// The page name lives at index 0 and levels start at 1, so it is
			// never dropped.
			trail.length = level;
			trail[level] = text;
			heading = trailOf(trail);
			continue;
		}

		const wouldBe = [...buffer, text].join('\n\n');
		if (buffer.length > 0 && wouldBe.length > CHUNK_BUDGET) flush();
		buffer.push(text);
	}
	flush();

	return chunks.map((chunk, index) => ({ ...chunk, index }));
}
