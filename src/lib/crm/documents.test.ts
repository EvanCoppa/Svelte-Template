import { describe, expect, it } from 'vitest';
import {
	blockText,
	documentBody,
	documentMentions,
	documentSubtreeIds,
	documentTitle,
	documentTree,
	emptyDocumentBody,
	flattenDocumentTree,
	mentionAnchor,
	type DocumentNode
} from './documents';

const paragraph = (text: string) => ({ type: 'paragraph', data: { text } });

describe('documentBody', () => {
	it('reads a well-formed body through', () => {
		const body = { version: 1, blocks: [paragraph('hello')] };
		expect(documentBody(body)).toEqual(body);
	});

	it('opens empty rather than half-understood when the body is unreadable', () => {
		expect(documentBody(null)).toEqual(emptyDocumentBody());
		expect(documentBody('nonsense')).toEqual(emptyDocumentBody());
		expect(documentBody({ version: 1 })).toEqual(emptyDocumentBody());
	});

	it('drops blocks that are not blocks but keeps the ones that are', () => {
		const body = documentBody({
			version: 1,
			blocks: [paragraph('kept'), null, 'nope', { type: 'header' }]
		});
		expect(body.blocks).toEqual([paragraph('kept')]);
	});

	it('supplies a version when an old row has none', () => {
		expect(documentBody({ blocks: [] }).version).toBe(1);
	});
});

describe('blockText', () => {
	it('strips the markup the editor wrote around the words', () => {
		expect(blockText(paragraph('a <b>bold</b> claim'))).toBe('a bold claim');
	});

	it('decodes the entities an editor escapes', () => {
		expect(blockText(paragraph('Ben &amp; Jerry&#39;s &lt;tag&gt;'))).toBe("Ben & Jerry's <tag>");
	});

	it('reaches text nested inside a block, not only a top-level field', () => {
		const list = { type: 'list', data: { items: [{ content: 'one' }, { content: 'two' }] } };
		expect(blockText(list)).toBe('one two');
	});
});

describe('documentTitle', () => {
	it('prefers the title', () => {
		expect(documentTitle({ title: 'Account strategy', body: null })).toBe('Account strategy');
	});

	it('falls back to the first words in the body, the way a note uses its first line', () => {
		const body = { version: 1, blocks: [paragraph(''), paragraph('Roof survey findings')] };
		expect(documentTitle({ title: '  ', body })).toBe('Roof survey findings');
	});

	it('truncates a long first line rather than printing a paragraph as a name', () => {
		const long = 'x'.repeat(200);
		const title = documentTitle({ title: null, body: { version: 1, blocks: [paragraph(long)] } });
		expect(title).toHaveLength(80);
		expect(title.endsWith('…')).toBe(true);
	});

	it('is never empty', () => {
		expect(documentTitle({ title: null, body: null })).toBe('Untitled');
	});
});

describe('documentMentions', () => {
	const company = { kind: 'company' as const, id: '11111111-1111-4111-8111-111111111111' };
	const contact = { kind: 'contact' as const, id: '22222222-2222-4222-8222-222222222222' };

	it('reads back the anchor the editor writes — the two must never disagree', () => {
		const body = { version: 1, blocks: [paragraph(`Met ${mentionAnchor(company, 'Acme')} today`)] };
		expect(documentMentions(body)).toEqual([company]);
	});

	it('escapes the label so a name with markup in it cannot break the anchor', () => {
		expect(mentionAnchor(company, 'Ben & <b>Co</b>')).toContain('Ben &amp; &lt;b&gt;Co&lt;/b&gt;');
	});

	it('finds a mention wherever it lands, not only in a paragraph', () => {
		const body = {
			version: 1,
			blocks: [
				{ type: 'header', data: { text: mentionAnchor(company, 'Acme') } },
				{ type: 'list', data: { items: [{ content: mentionAnchor(contact, 'Dana') }] } }
			]
		};
		expect(documentMentions(body)).toEqual([company, contact]);
	});

	it('names a record once however many times the body mentions it', () => {
		const text = `${mentionAnchor(company, 'Acme')} and ${mentionAnchor(company, 'Acme again')}`;
		expect(documentMentions({ version: 1, blocks: [paragraph(text)] })).toEqual([company]);
	});

	it('keeps the order the body names them in', () => {
		const text = `${mentionAnchor(contact, 'Dana')} works at ${mentionAnchor(company, 'Acme')}`;
		expect(documentMentions({ version: 1, blocks: [paragraph(text)] })).toEqual([contact, company]);
	});

	it('skips a kind the app has no page for, so the index only holds openable things', () => {
		const text =
			'<a data-mention-type="proposal_option" data-mention-id="33333333-3333-4333-8333-333333333333">Option</a>';
		expect(documentMentions({ version: 1, blocks: [paragraph(text)] })).toEqual([]);
	});

	it('ignores an ordinary link and a malformed anchor', () => {
		const text = '<a href="https://example.com">site</a><a data-mention-type="company">no id</a>';
		expect(documentMentions({ version: 1, blocks: [paragraph(text)] })).toEqual([]);
	});

	it('reads an unreadable body as naming nothing', () => {
		expect(documentMentions(null)).toEqual([]);
	});
});

describe('documentTree', () => {
	const node = (id: string, parent_id: string | null): DocumentNode => ({
		id,
		parent_id,
		title: id
	});

	it('nests children under their parent', () => {
		const tree = documentTree([node('a', null), node('b', 'a'), node('c', 'b')]);
		expect(tree).toHaveLength(1);
		expect(tree[0]?.children[0]?.children[0]?.document.id).toBe('c');
		expect(flattenDocumentTree(tree).map((n) => [n.document.id, n.depth])).toEqual([
			['a', 0],
			['b', 1],
			['c', 2]
		]);
	});

	it('shows an orphan as a root rather than dropping it', () => {
		const tree = documentTree([node('a', null), node('b', 'missing')]);
		expect(tree.map((n) => n.document.id)).toEqual(['a', 'b']);
	});

	it('surfaces a cycle instead of hanging the walk', () => {
		const tree = documentTree([node('a', 'b'), node('b', 'a')]);
		expect(
			flattenDocumentTree(tree)
				.map((n) => n.document.id)
				.sort()
		).toEqual(['a', 'b']);
	});
});

describe('documentSubtreeIds', () => {
	const node = (id: string, parent_id: string | null): DocumentNode => ({
		id,
		parent_id,
		title: id
	});

	it('holds the page itself and everything under it — what a move must refuse', () => {
		const documents = [node('a', null), node('b', 'a'), node('c', 'b'), node('d', null)];
		expect([...documentSubtreeIds(documents, 'a')].sort()).toEqual(['a', 'b', 'c']);
	});

	it('terminates on a cycle', () => {
		expect([...documentSubtreeIds([node('a', 'b'), node('b', 'a')], 'a')].sort()).toEqual([
			'a',
			'b'
		]);
	});
});
