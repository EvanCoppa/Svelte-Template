import { describe, expect, it } from 'vitest';
import { pinnedCellClass, pinnedCellStyle, pinnedColumnCount } from './pinned.js';

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

	it('pins every row control in front of the first column of data', () => {
		expect(pinnedColumnCount(['expand', 'name', 'email'])).toBe(2);
		expect(pinnedColumnCount(['expand', 'select', 'name', 'email'])).toBe(3);
	});

	it('never pins more columns than the table has when it is all controls', () => {
		expect(pinnedColumnCount(['expand', 'select'])).toBe(2);
	});
});

describe('pinnedCellClass', () => {
	it('leaves a cell past the pinned run alone', () => {
		expect(pinnedCellClass(2, 2, false, 'cell')).toBe(false);
	});

	it('gives only the last pinned cell the edge the columns slide under', () => {
		expect(pinnedCellClass(0, 2, false, 'cell')).not.toContain('border-e-2');
		expect(pinnedCellClass(1, 2, false, 'cell')).toContain('border-e-2');
	});

	it('casts a shadow off that edge only once the reader has scrolled', () => {
		expect(pinnedCellClass(0, 1, false, 'cell')).not.toContain('shadow-');
		expect(pinnedCellClass(0, 1, true, 'cell')).toContain('shadow-');
	});

	it('tints a nested row on its own layer, since the base must stay opaque', () => {
		const sub = pinnedCellClass(0, 1, false, 'sub');
		expect(sub).toContain('before:bg-background');
		expect(sub).toContain('after:bg-muted/60');
	});
});

describe('pinnedCellStyle', () => {
	it('stands every pinned cell clear of the ones before it', () => {
		// A chevron, a checkbox and the column of data behind them.
		const offsets = [0, 32, 64];
		expect(pinnedCellStyle(0, 3, offsets)).toBe('left: 0px');
		expect(pinnedCellStyle(1, 3, offsets)).toBe('left: 32px');
		expect(pinnedCellStyle(2, 3, offsets)).toBe('left: 64px');
	});

	it('leaves a cell past the pinned run to scroll', () => {
		expect(pinnedCellStyle(3, 3, [0, 32, 64])).toBeUndefined();
	});

	it('reads as flush with the start before anything has been measured', () => {
		expect(pinnedCellStyle(1, 2, [])).toBe('left: 0px');
	});
});
