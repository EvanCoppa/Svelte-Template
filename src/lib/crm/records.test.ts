import { describe, expect, it } from 'vitest';
import type { TermsMap } from '$lib/features/terms';
import {
	RECORD_KINDS,
	RECORD_KIND_META,
	isRecordSegment,
	recordHref,
	recordKindForSegment,
	recordListHref,
	recordTerms
} from './records';

describe('record kinds', () => {
	it('builds the record page path under the kind’s list route', () => {
		expect(recordListHref('contact')).toBe('/contacts');
		expect(recordHref('contact', '30000000-0000-0000-0000-000000000001')).toBe(
			'/contacts/30000000-0000-0000-0000-000000000001'
		);
		expect(recordHref('ticket', 'abc')).toBe('/tickets/abc');
	});

	it('recognises exactly the list-route segments, and nothing else under the shell', () => {
		for (const kind of RECORD_KINDS) {
			expect(isRecordSegment(RECORD_KIND_META[kind].segment)).toBe(true);
		}
		// Shell surfaces and other features are not records.
		for (const segment of ['settings', 'staff', 'assistant', 'components', '', 'company']) {
			expect(isRecordSegment(segment)).toBe(false);
		}
	});

	it('maps a matched segment back to its kind', () => {
		expect(recordKindForSegment('companies')).toBe('company');
		expect(recordKindForSegment('products')).toBe('product');
		expect(recordKindForSegment('proposals')).toBe('proposal');
		expect(recordKindForSegment('tickets')).toBe('ticket');
	});

	it('sits under the feature whose gate covers it', () => {
		// The hook gates by route prefix, so a kind's segment has to be its
		// feature's route — otherwise the record page would be ungated.
		for (const kind of RECORD_KINDS) {
			expect(RECORD_KIND_META[kind].segment).toBe(RECORD_KIND_META[kind].feature);
		}
	});
});

describe('recordTerms', () => {
	const terms: TermsMap = {
		proposals: { name: 'Treatment plans', noun: 'treatment plan' },
		deals: { name: 'Deals', noun: 'deal' },
		staff: { name: 'Staff', noun: null }
	};

	it("gives a kind its feature's words: the list, one of them, and the list in running text", () => {
		expect(recordTerms(terms, 'proposal')).toEqual({
			name: 'Treatment plans',
			noun: 'treatment plan',
			plural: 'treatment plans'
		});
		expect(recordTerms(terms, 'deal')).toEqual({ name: 'Deals', noun: 'deal', plural: 'deals' });
	});

	it('throws for a kind whose feature is not on screen, or names no noun', () => {
		// Unreachable on a page the gate served; loud rather than a blank label.
		expect(() => recordTerms(terms, 'ticket')).toThrow(/tickets feature is not on screen/);
		expect(() => recordTerms(undefined, 'deal')).toThrow(/deals feature/);
		expect(() =>
			recordTerms({ ...terms, tickets: { name: 'Tickets', noun: null } }, 'ticket')
		).toThrow(/tickets feature/);
	});
});
