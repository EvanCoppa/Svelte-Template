import { describe, expect, it } from 'vitest';
import type { Json } from '$lib/database.types';
import { chunkDocument, CHUNK_BUDGET } from './chunks';

const paragraph = (text: string): Json => ({ type: 'paragraph', data: { text } });
const header = (text: string, level = 2): Json => ({ type: 'header', data: { text, level } });
const body = (...blocks: Json[]): Json => ({ version: 1, blocks });

describe('chunkDocument', () => {
	it('keeps a short page as one passage under the page name', () => {
		const chunks = chunkDocument(body(paragraph('The flashing has failed.')), 'Roof survey');
		expect(chunks).toEqual([
			{
				index: 0,
				heading: 'Roof survey',
				content: 'Roof survey\n\nThe flashing has failed.'
			}
		]);
	});

	it('starts a new passage at every heading — that is where the subject changes', () => {
		const chunks = chunkDocument(
			body(
				paragraph('Surveyed on Tuesday.'),
				header('North elevation'),
				paragraph('Flashing has failed.'),
				header('South slope'),
				paragraph('Good condition.')
			),
			'Roof survey'
		);
		expect(chunks.map((c) => c.heading)).toEqual([
			'Roof survey',
			'Roof survey › North elevation',
			'Roof survey › South slope'
		]);
		expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
	});

	it('nests a deeper heading under the one above it', () => {
		const chunks = chunkDocument(
			body(header('Findings', 2), header('Parapet', 3), paragraph('Cracked in two places.')),
			'Roof survey'
		);
		expect(chunks[0]?.heading).toBe('Roof survey › Findings › Parapet');
	});

	it('pops back out when a heading rises a level again', () => {
		const chunks = chunkDocument(
			body(
				header('Findings', 2),
				header('Parapet', 3),
				paragraph('Cracked.'),
				header('Costs', 2),
				paragraph('Twelve thousand.')
			),
			'Roof survey'
		);
		expect(chunks.map((c) => c.heading)).toEqual([
			'Roof survey › Findings › Parapet',
			'Roof survey › Costs'
		]);
	});

	it('works with no page name at all', () => {
		const chunks = chunkDocument(body(header('Findings'), paragraph('Cracked in two places.')));
		expect(chunks[0]?.heading).toBe('Findings');
		expect(chunks[0]?.content).toBe('Findings\n\nCracked in two places.');
	});

	it('gathers several paragraphs into one passage while they fit', () => {
		const chunks = chunkDocument(
			body(paragraph('One sentence here.'), paragraph('Another sentence here.')),
			null
		);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.content).toBe('One sentence here.\n\nAnother sentence here.');
	});

	it('closes a passage before it exceeds the budget rather than after', () => {
		const long = 'x'.repeat(Math.floor(CHUNK_BUDGET * 0.7));
		const chunks = chunkDocument(body(paragraph(long), paragraph(long), paragraph(long)), null);
		expect(chunks).toHaveLength(3);
		for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_BUDGET);
	});

	it('lets one long paragraph travel whole rather than cutting it at the budget', () => {
		const long = `${'x'.repeat(CHUNK_BUDGET + 200)}.`;
		const chunks = chunkDocument(body(paragraph(long)), null);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.content).toContain(long);
	});

	it('splits a genuinely enormous paragraph on sentence ends', () => {
		const sentence = `${'word '.repeat(200)}end. `;
		const chunks = chunkDocument(body(paragraph(sentence.repeat(6))), null);
		expect(chunks.length).toBeGreaterThan(1);
		// No passage begins mid-clause.
		for (const chunk of chunks.slice(1)) expect(chunk.content.startsWith(' ')).toBe(false);
	});

	it('reads a mention as the name it shows, not as markup', () => {
		const text =
			'Agreed with <a class="doc-mention" data-mention-type="company" data-mention-id="11111111-1111-4111-8111-111111111111">Wayne Enterprises</a> today.';
		const chunks = chunkDocument(body(paragraph(text)), null);
		expect(chunks[0]?.content).toBe('Agreed with Wayne Enterprises today.');
	});

	it('reaches the words inside a list', () => {
		const list = { type: 'list', data: { items: [{ content: 'Replace flashing' }] } };
		expect(chunkDocument(body(list), null)[0]?.content).toContain('Replace flashing');
	});

	it('skips furniture that carries no words', () => {
		const chunks = chunkDocument(
			body({ type: 'delimiter', data: {} }, { type: 'image', data: { caption: 'A roof' } }),
			null
		);
		expect(chunks).toEqual([]);
	});

	it('drops a scrap too short to be worth embedding', () => {
		expect(chunkDocument(body(paragraph('ok')), null)).toEqual([]);
		expect(chunkDocument(body(paragraph('12/4')), null)).toEqual([]);
	});

	it('chunks an unreadable body to nothing rather than throwing', () => {
		expect(chunkDocument(null)).toEqual([]);
		expect(chunkDocument('nonsense')).toEqual([]);
	});

	it('numbers passages contiguously from zero', () => {
		const chunks = chunkDocument(
			body(
				header('A'),
				paragraph('The first section body.'),
				header('B'),
				paragraph('The second section body.')
			),
			'Page'
		);
		expect(chunks.map((c) => c.index)).toEqual([0, 1]);
	});
});
