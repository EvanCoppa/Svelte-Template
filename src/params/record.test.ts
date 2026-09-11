import { describe, expect, it } from 'vitest';
import { match } from './record';

describe('the [kind=record] matcher', () => {
	it('accepts the list routes that serve records', () => {
		const segments = [
			'assets',
			'billables',
			'companies',
			'contacts',
			'products',
			'deals',
			'proposals',
			'tasks',
			'tickets'
		];
		for (const segment of segments) {
			expect(match(segment)).toBe(true);
		}
	});

	it('refuses every other segment, so other routes keep their own nested pages', () => {
		for (const segment of ['settings', 'assistant', 'staff', 'company', 'Contacts', '']) {
			expect(match(segment)).toBe(false);
		}
	});
});
