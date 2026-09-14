import { describe, expect, it } from 'vitest';
import { pinnedColumnCount } from './pinned.js';

describe('pinnedColumnCount', () => {
	it('pins the first column', () => {
		expect(pinnedColumnCount(['name', 'email', 'status'])).toBe(1);
	});

	it('pins the selection checkbox together with the column after it', () => {
		expect(pinnedColumnCount(['select', 'name', 'email'])).toBe(2);
	});

	it('never pins more columns than the table has', () => {
		expect(pinnedColumnCount(['select'])).toBe(1);
		expect(pinnedColumnCount([])).toBe(0);
	});

	it('treats a selection column that is not first as an ordinary column', () => {
		expect(pinnedColumnCount(['name', 'select'])).toBe(1);
	});
});
