import { describe, expect, it } from 'vitest';
import { billableQuantity, unitTokens } from './billables';

describe('unitTokens', () => {
	it('splits on commas and whitespace, and expands ascending ranges', () => {
		expect(unitTokens('12, 13')).toEqual(['12', '13']);
		expect(unitTokens('1-3 5')).toEqual(['1', '2', '3', '5']);
		expect(unitTokens('UR, UL')).toEqual(['UR', 'UL']);
		expect(unitTokens('north slope')).toEqual(['north', 'slope']);
	});

	it('names nothing for a blank string or a reversed range, and never dedupes', () => {
		expect(unitTokens('')).toEqual([]);
		expect(unitTokens('   ')).toEqual([]);
		expect(unitTokens('3-1')).toEqual([]);
		expect(unitTokens('5, 5')).toEqual(['5', '5']);
	});
});

describe('billableQuantity', () => {
	it('counts the units, with a floor of one, and reads N/A as one', () => {
		expect(billableQuantity('12, 13', false)).toBe(2);
		expect(billableQuantity('', false)).toBe(1);
		expect(billableQuantity('12, 13', true)).toBe(1);
	});
});
