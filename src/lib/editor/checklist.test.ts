import { describe, expect, it } from 'vitest';
import { checklistItem, toggleChecklistItem } from './checklist';

describe('checklistItem', () => {
	it('recognises an item and whether it is ticked', () => {
		expect(checklistItem('- [ ] call John')).toEqual({ checked: false });
		expect(checklistItem('- [x] call John')).toEqual({ checked: true });
		expect(checklistItem('- [X] call John')).toEqual({ checked: true });
	});

	it('takes an asterisk and any indentation', () => {
		expect(checklistItem('* [ ] call John')).toEqual({ checked: false });
		expect(checklistItem('    - [ ] nested')).toEqual({ checked: false });
	});

	it('is not fooled by a line that merely has brackets', () => {
		expect(checklistItem('call John [urgent]')).toBeNull();
		expect(checklistItem('- call John')).toBeNull();
		expect(checklistItem('')).toBeNull();
	});
});

describe('toggleChecklistItem', () => {
	it('ticks and unticks one box', () => {
		expect(toggleChecklistItem('- [ ] a', 0)).toBe('- [x] a');
		expect(toggleChecklistItem('- [x] a', 0)).toBe('- [ ] a');
	});

	it('touches nothing else in the note', () => {
		const body = 'notes\n- [ ] a\n- [ ] b\ntrailing';
		expect(toggleChecklistItem(body, 1)).toBe('notes\n- [x] a\n- [ ] b\ntrailing');
	});

	it('changes exactly one character', () => {
		const body = '- [ ] a\n- [ ] b';
		const after = toggleChecklistItem(body, 1);
		const differences = [...body].filter((char, i) => char !== after[i]).length;
		expect(after).toHaveLength(body.length);
		expect(differences).toBe(1);
	});

	it('is a no-op on a line that is not an item, or is not there', () => {
		expect(toggleChecklistItem('prose', 0)).toBe('prose');
		expect(toggleChecklistItem('- [ ] a', 5)).toBe('- [ ] a');
		expect(toggleChecklistItem('', 0)).toBe('');
	});
});
