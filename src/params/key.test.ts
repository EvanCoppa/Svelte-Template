import { describe, expect, it } from 'vitest';
import { match } from './key';

describe('the [id=key] matcher', () => {
	it('accepts the reference-catalog keys the platform area links to', () => {
		for (const key of ['free', 'pro', 'crm', 'medical-supplies', 'best-practices', 'deals']) {
			expect(match(key)).toBe(true);
		}
	});

	it('rejects anything that is not one, so it never reaches a load', () => {
		// Traversal, casing and the empty segment: a 404 from the router
		// rather than a database error or a surprising lookup.
		for (const not of ['', '..', 'Settings', 'has space', '-leading', '9lives', 'a/b']) {
			expect(match(not)).toBe(false);
		}
	});
});
