import { describe, expect, it } from 'vitest';
import { computeNote, ERROR_MARK, type LineResult } from './compute';

/**
 * The rules of the note calculator, stated as tests — `docs/antinote-in-notes.md`
 * is the prose version. The one that matters most is the last group: a note is
 * mostly prose, and prose must stay silent.
 */

/** The result beside one line, as the gutter would show it. */
function line(body: string, index: number): LineResult {
	return computeNote(body)[index];
}

/** The text beside one line, or null when the gutter is empty there. */
function text(body: string, index: number): string | null {
	return line(body, index)?.text ?? null;
}

describe('computeNote', () => {
	it('answers one result per line, in step with the body', () => {
		expect(computeNote('2 + 2\n\nprose')).toHaveLength(3);
		expect(computeNote('')).toHaveLength(1);
	});

	describe('arithmetic', () => {
		it('adds, subtracts, multiplies and divides', () => {
			expect(text('2 + 3', 0)).toBe('5');
			expect(text('10 - 4', 0)).toBe('6');
			expect(text('25 * 37.5', 0)).toBe('937.5');
			expect(text('10 / 4', 0)).toBe('2.5');
		});

		it('follows precedence and brackets', () => {
			expect(text('2 + 3 * 4', 0)).toBe('14');
			expect(text('(2 + 3) * 4', 0)).toBe('20');
			expect(text('2 ^ 10', 0)).toBe('1,024');
		});

		it('reads a negative number and the × ÷ people actually type', () => {
			expect(text('-5 + 2', 0)).toBe('-3');
			expect(text('6 × 7', 0)).toBe('42');
			expect(text('84 ÷ 2', 0)).toBe('42');
		});

		it('separates thousands, and does not leave float noise behind', () => {
			expect(text('1200 * 3', 0)).toBe('3,600');
			expect(text('1,200 + 300', 0)).toBe('1,500');
			expect(text('0.1 + 0.2', 0)).toBe('0.3');
		});

		it('says nothing for a line that is only a number', () => {
			expect(text('42', 0)).toBeNull();
			expect(text('$5', 0)).toBeNull();
		});
	});

	describe('variables', () => {
		it('names a number and uses it below', () => {
			const body = 'price = 37.50\nquantity = 25\nprice * quantity';
			expect(text(body, 0)).toBe('37.5');
			expect(text(body, 2)).toBe('937.5');
		});

		it('recomputes everything below when the number changes', () => {
			expect(text('price = 40\nprice * 25', 1)).toBe('1,000');
		});

		it('sees only the assignments above it', () => {
			// Silent rather than dashed: at line 0 the name means nothing yet, and
			// a word that means nothing is prose.
			expect(text('total * 2\ntotal = 5', 0)).toBeNull();
			expect(text('total = 5\ntotal * 2', 1)).toBe('10');
		});

		it('lets a defined name win over a unit spelled the same way', () => {
			expect(text('t = 3\nt * 2', 1)).toBe('6');
		});

		it('carries money through to the answer', () => {
			expect(text('price = $37.50\nprice * 4', 1)).toBe('$150.00');
		});
	});

	describe('percentages', () => {
		it('adds and subtracts a percentage of the number on the left', () => {
			expect(text('250 + 8%', 0)).toBe('270');
			expect(text('250 - 10%', 0)).toBe('225');
		});

		it('multiplies by a percentage as a fraction', () => {
			expect(text('250 * 8%', 0)).toBe('20');
		});

		it('takes a percentage of something', () => {
			expect(text('8% of 250', 0)).toBe('20');
			expect(text('total = 250\n8% of total', 1)).toBe('20');
		});

		it('refuses "of" when the left side is not a percentage', () => {
			expect(line('5 of 250', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
		});
	});

	describe('conversions', () => {
		it('converts length and mass by fixed ratio, keeping the unit', () => {
			expect(text('12 ft to m', 0)).toBe('3.6576 m');
			expect(text('50 kg to lb', 0)).toBe('110.2311 lb');
			expect(text('2 miles to km', 0)).toBe('3.2187 km');
		});

		it('takes the words as well as the symbols', () => {
			expect(text('3 feet to inches', 0)).toBe('36 in');
		});

		it('converts the result of a sum', () => {
			expect(text('(10 + 2) ft to in', 0)).toBe('144 in');
		});

		it('refuses to add a measurement to a bare number', () => {
			// "10 + 2 ft" has no defensible reading, so it does not get one.
			expect(line('10 + 2 ft', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
		});

		it('adds two measurements in the units of the first', () => {
			expect(text('1 m + 50 cm', 0)).toBe('1.5 m');
		});

		it('refuses units that measure different things', () => {
			expect(line('1 kg + 2 m', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
			expect(line('5 ft to kg', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
		});
	});

	describe('aggregates', () => {
		it('totals the numbers directly above', () => {
			expect(text('10\n20\n30\nsum', 3)).toBe('60');
			expect(text('10\n20\n30\ntotal', 3)).toBe('60');
		});

		it('averages them', () => {
			expect(text('10\n20\n30\naverage', 3)).toBe('20');
			expect(text('10\n20\n30\navg', 3)).toBe('20');
		});

		it('counts them', () => {
			expect(text('10\n20\n30\ncount', 3)).toBe('3');
		});

		it('stops at a blank line, so one list does not bleed into the next', () => {
			expect(text('100\n\n10\n20\nsum', 4)).toBe('30');
		});

		it('totals computed lines, not just typed ones', () => {
			expect(text('2 * 5\n4 * 5\nsum', 2)).toBe('30');
		});

		it('keeps money and units in the total', () => {
			expect(text('$10\n$20\nsum', 2)).toBe('$30.00');
			expect(text('1 m\n50 cm\nsum', 2)).toBe('1.5 m');
		});

		it('counts words and lines across the whole note', () => {
			expect(text('one two three\ncount words', 1)).toBe('5');
			expect(text('a\nb\n\ncount lines', 3)).toBe('3');
		});

		it('says nothing useful when there is nothing above it', () => {
			expect(line('sum', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
		});
	});

	describe('labels', () => {
		it('ignores a label in front of the sum', () => {
			expect(text('Total: 25 * 4', 0)).toBe('100');
			expect(text('Deposit: 20% of 1500', 0)).toBe('300');
		});
	});

	describe('silence', () => {
		it('says nothing about prose', () => {
			expect(text('John called about the roof', 0)).toBeNull();
			expect(text('needs 25 widgets by Friday', 0)).toBeNull();
			expect(text('', 0)).toBeNull();
			expect(text('   ', 0)).toBeNull();
		});

		it('says nothing about a sentence that merely contains numbers', () => {
			expect(text('call John on 555 1234', 0)).toBeNull();
			expect(text('meet at 5pm', 0)).toBeNull();
		});

		it('says nothing about a checklist item', () => {
			expect(text('- [ ] call John', 0)).toBeNull();
			expect(text('- [x] 2 + 2', 0)).toBeNull();
		});

		it('leaves a quiet dash where the arithmetic does not work out', () => {
			expect(line('10 / 0', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
			expect(line('(2 + 3', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
			expect(line('1 kg + 2', 0)).toEqual({ kind: 'error', text: ERROR_MARK });
		});

		it('stays silent on a name it does not know, rather than crying typo', () => {
			// The gate cannot tell a misspelt variable from an English word, and
			// sentences are what notes are mostly made of — so an unknown word
			// makes the whole line prose. `compute.ts`, `looksLikeMath()`.
			expect(text('unknown * 2', 0)).toBeNull();
			expect(text('widgets * 25', 0)).toBeNull();
		});

		it('never throws, whatever is in the note', () => {
			const nonsense = '((((\n%%%\n= = =\n$$$\n1 + \n^^^\nto to to\n%\n- - -';
			expect(() => computeNote(nonsense)).not.toThrow();
			expect(computeNote(nonsense)).toHaveLength(9);
		});
	});

	it('leaves the body alone — it only ever reads', () => {
		const body = 'price = 10\nprice * 2\n- [ ] ship it';
		const before = body;
		computeNote(body);
		expect(body).toBe(before);
	});
});
