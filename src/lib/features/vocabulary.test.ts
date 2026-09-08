import { describe, expect, it } from 'vitest';
import { resolveVocabulary, term, type TermRegistryRow } from './vocabulary';

const rows: TermRegistryRow[] = [
	{
		id: 'proposal_presenter',
		label: 'Presenter',
		description: null,
		created_at: '',
		industry_terms: [{ industry_id: 'roofing', label: 'Estimator' }]
	},
	{
		id: 'proposal_responsible',
		label: 'Responsible',
		description: null,
		created_at: '',
		industry_terms: [
			{ industry_id: 'dentistry', label: 'Provider' },
			{ industry_id: 'roofing', label: 'Project manager' }
		]
	}
];

describe('resolveVocabulary', () => {
	it("uses the industry's own word where it has one, the default otherwise", () => {
		expect(resolveVocabulary(rows, 'dentistry')).toEqual({
			proposal_presenter: 'Presenter',
			proposal_responsible: 'Provider'
		});
		expect(resolveVocabulary(rows, 'roofing')).toEqual({
			proposal_presenter: 'Estimator',
			proposal_responsible: 'Project manager'
		});
	});

	it('falls back to every default for an industry with no rows', () => {
		expect(resolveVocabulary(rows, 'beverage')).toEqual({
			proposal_presenter: 'Presenter',
			proposal_responsible: 'Responsible'
		});
	});

	it('refuses a registry missing a term the app knows, and ignores ones it does not', () => {
		expect(() => resolveVocabulary(rows.slice(0, 1), 'crm')).toThrow('proposal_responsible');
		const extra = [
			...rows,
			{ id: 'unknown', label: 'X', description: null, created_at: '', industry_terms: [] }
		];
		expect(Object.keys(resolveVocabulary(extra, 'crm'))).toEqual([
			'proposal_presenter',
			'proposal_responsible'
		]);
	});
});

describe('term', () => {
	it('reads a word from the shipped vocabulary and throws when nothing was shipped', () => {
		const vocabulary = resolveVocabulary(rows, 'dentistry');
		expect(term(vocabulary, 'proposal_responsible')).toBe('Provider');
		expect(() => term(undefined, 'proposal_presenter')).toThrow('did not ship');
	});
});
