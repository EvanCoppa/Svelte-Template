import { describe, expect, it } from 'vitest';
import { mentionQueryAt } from './mentions';

describe('mentionQueryAt', () => {
	const at = (text: string) => mentionQueryAt(text, text.length);

	it('finds a trigger at the start of a line', () => {
		expect(at('@ac')).toEqual({ start: 0, end: 3, query: 'ac' });
	});

	it('finds a trigger after a space', () => {
		expect(at('spoke to @dan')).toEqual({ start: 9, end: 13, query: 'dan' });
	});

	it('opens on the bare trigger, so the menu can offer recent records', () => {
		expect(at('@')).toEqual({ start: 0, end: 1, query: '' });
	});

	it('allows one space, so a two-word name still matches', () => {
		expect(at('@Acme Ho')?.query).toBe('Acme Ho');
	});

	it('stands down once the typist has moved on', () => {
		expect(at('@Acme Holdings Group')).toBeNull();
	});

	it('is not fooled by an email address', () => {
		expect(at('write to dana@acme')).toBeNull();
	});

	it('is not fooled by a newline or a tab in the query', () => {
		expect(at('@one\ntwo')).toBeNull();
		expect(at('@one\ttwo')).toBeNull();
	});

	it('takes the last trigger, not the first', () => {
		expect(at('@one and @tw')).toEqual({ start: 9, end: 12, query: 'tw' });
	});

	it('stands down on a query too long to be a name', () => {
		expect(at(`@${'x'.repeat(61)}`)).toBeNull();
	});

	it('reads from the caret, not the end of the text', () => {
		expect(mentionQueryAt('@ac and more', 3)).toEqual({ start: 0, end: 3, query: 'ac' });
	});

	it('finds nothing when there is no trigger', () => {
		expect(at('just a sentence')).toBeNull();
	});
});
