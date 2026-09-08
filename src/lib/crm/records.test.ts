import { describe, expect, it } from 'vitest';
import {
	RECORD_KINDS,
	RECORD_KIND_META,
	isRecordSegment,
	recordHref,
	recordKindForSegment,
	recordListHref
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
