import { describe, expect, it } from 'vitest';
import {
	DECK_VERSION,
	slideBuilderSchema,
	slideContentSchema,
	slideDeckSchema,
	slideInstanceSchema,
	slideVariableSchema
} from './decks';

function messagesOf(result: { error?: { issues: { message: string }[] } }) {
	return result.error?.issues.map((issue) => issue.message).join(' ') ?? '';
}

const slide = {
	id: 's1',
	templateId: 'comparison-table',
	content: { text: { heading: 'Compare Your Options' } }
};

describe('slideVariableSchema', () => {
	it('accepts a dot path and rejects anything else', () => {
		expect(slideVariableSchema.safeParse({ sourceField: 'client.name' }).success).toBe(true);
		expect(slideVariableSchema.safeParse({ sourceField: 'option.computed_total' }).success).toBe(
			true
		);
		expect(messagesOf(slideVariableSchema.safeParse({ sourceField: 'client name' }))).toMatch(
			/dot path/
		);
		expect(messagesOf(slideVariableSchema.safeParse({ sourceField: '' }))).toMatch(/source field/);
	});
});

describe('slideContentSchema', () => {
	it('defaults every slot so a bare slide still renders', () => {
		expect(slideContentSchema.safeParse({}).data).toEqual({
			text: {},
			images: {},
			colors: {},
			styles: {},
			variables: {}
		});
	});

	it('takes image URLs or an unfilled slot, but never inline data', () => {
		expect(slideContentSchema.safeParse({ images: { logo: 'https://x.test/a.png' } }).success).toBe(
			true
		);
		expect(slideContentSchema.safeParse({ images: { logo: '' } }).success).toBe(true);
		expect(slideContentSchema.safeParse({ images: { logo: 'not a url' } }).success).toBe(false);
		expect(
			messagesOf(slideContentSchema.safeParse({ images: { logo: 'data:image/png;base64,AAAA' } }))
		).toMatch(/not inline data/);
	});

	it('carries variables keyed by the text slot they fill', () => {
		const result = slideContentSchema.safeParse({
			text: { heading: 'A proposal for you' },
			variables: { heading: { sourceField: 'proposal.title' } }
		});
		expect(result.success).toBe(true);
		expect(result.data?.variables.heading?.sourceField).toBe('proposal.title');
	});
});

describe('slideInstanceSchema', () => {
	it('needs an id and a template', () => {
		expect(slideInstanceSchema.safeParse(slide).success).toBe(true);
		expect(messagesOf(slideInstanceSchema.safeParse({ ...slide, id: '  ' }))).toMatch(
			/needs an id/
		);
		expect(messagesOf(slideInstanceSchema.safeParse({ ...slide, templateId: '' }))).toMatch(
			/needs a template/
		);
	});

	it("accepts an unknown templateId — the registry is the renderer's business", () => {
		expect(slideInstanceSchema.safeParse({ ...slide, templateId: 'not-built-yet' }).success).toBe(
			true
		);
	});
});

describe('slideDeckSchema', () => {
	it('accepts an empty deck', () => {
		expect(slideDeckSchema.safeParse({ version: DECK_VERSION, slides: [] }).success).toBe(true);
		expect(slideDeckSchema.safeParse({ version: 1 }).data?.slides).toEqual([]);
	});

	it('keeps slide order as authored', () => {
		const result = slideDeckSchema.safeParse({
			version: DECK_VERSION,
			slides: [
				{ ...slide, id: 'a' },
				{ ...slide, id: 'b' },
				{ ...slide, id: 'c' }
			]
		});
		expect(result.data?.slides.map((s) => s.id)).toEqual(['a', 'b', 'c']);
	});

	it('rejects duplicate slide ids', () => {
		const result = slideDeckSchema.safeParse({
			version: DECK_VERSION,
			slides: [slide, { ...slide, templateId: 'title' }]
		});
		expect(messagesOf(result)).toMatch(/unique within a deck/);
	});

	it('refuses a version it cannot render', () => {
		expect(slideDeckSchema.safeParse({ version: DECK_VERSION + 1, slides: [] }).success).toBe(
			false
		);
		expect(slideDeckSchema.safeParse({ version: 0, slides: [] }).success).toBe(false);
	});

	it('holds no proposal data — unknown top-level keys are stripped', () => {
		const result = slideDeckSchema.safeParse({
			version: DECK_VERSION,
			slides: [],
			proposal_id: 'a1000000-0000-0000-0000-000000000001'
		});
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty('proposal_id');
	});
});

describe('slideBuilderSchema', () => {
	it('is the deck, whole, under one key', () => {
		const result = slideBuilderSchema.safeParse({
			deck: { version: DECK_VERSION, slides: [slide] }
		});
		expect(result.success).toBe(true);
		expect(result.data?.deck.slides).toHaveLength(1);
		expect(slideBuilderSchema.safeParse({}).success).toBe(false);
	});
});
