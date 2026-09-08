import { describe, expect, it } from 'vitest';
import { match } from './guid';

describe('the [id=guid] matcher', () => {
	it('accepts any 8-4-4-4-12 hex value, including the seed’s fixed ids', () => {
		expect(match('20000000-0000-0000-0000-000000000001')).toBe(true);
		expect(match('b2000000-0000-0000-0000-000000000001')).toBe(true);
		expect(match('6F9619FF-8B86-D011-B42D-00C04FC964FF')).toBe(true);
	});

	it('refuses anything that is not one, so a bad id is a 404 rather than a database error', () => {
		expect(match('new')).toBe(false);
		expect(match('20000000-0000-0000-0000-00000000000')).toBe(false);
		expect(match('20000000000000000000000000000001')).toBe(false);
		expect(match('')).toBe(false);
	});
});
