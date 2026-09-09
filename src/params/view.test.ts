import { describe, expect, it } from 'vitest';
import { match } from './view';

describe('the [view=view] matcher', () => {
	it('accepts a slug shaped like a view id', () => {
		for (const slug of ['suppliers', 'partner-contacts', 'patient-map', 'v2']) {
			expect(match(slug)).toBe(true);
		}
	});

	it('refuses anything that is not a lower-case slug', () => {
		for (const slug of ['', 'Suppliers', '-x', 'a b', 'a_b', '2026']) {
			expect(match(slug)).toBe(false);
		}
	});
});
