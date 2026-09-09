import { describe, expect, it } from 'vitest';
import {
	defaultPreferences,
	isPreferenceKey,
	PREFERENCES,
	PREFERENCE_KEYS,
	resolvePreferences
} from './preferences';

describe('the preference registry', () => {
	it('declares a fallback its own schema accepts', () => {
		// A fallback that failed its schema would be a preference nobody could
		// ever save back to its default.
		for (const key of PREFERENCE_KEYS) {
			expect(PREFERENCES[key].schema.safeParse(PREFERENCES[key].fallback).success).toBe(true);
		}
	});

	it('knows its own keys and nothing else', () => {
		expect(isPreferenceKey('notes.dock')).toBe(true);
		expect(isPreferenceKey('notes.rail')).toBe(false);
		expect(isPreferenceKey('__proto__')).toBe(false);
	});
});

describe('resolvePreferences', () => {
	it('is every fallback when nothing is stored', () => {
		expect(resolvePreferences([])).toEqual(defaultPreferences());
		expect(resolvePreferences([])['notes.dock']).toBe(true);
	});

	it('takes a stored value over the fallback', () => {
		expect(resolvePreferences([{ key: 'notes.dock', value: false }])['notes.dock']).toBe(false);
	});

	it('ignores a key this build does not know', () => {
		// A preference removed in a later version leaves its rows behind.
		expect(resolvePreferences([{ key: 'notes.gone', value: 'whatever' }])).toEqual(
			defaultPreferences()
		);
	});

	it('falls back rather than trusting a value that fails its schema', () => {
		// What a key whose type changed looks like on the first load after a
		// deploy: the row is real, the value is last version's shape.
		expect(resolvePreferences([{ key: 'notes.dock', value: 'yes' }])['notes.dock']).toBe(true);
		expect(resolvePreferences([{ key: 'notes.dock', value: null }])['notes.dock']).toBe(true);
	});

	it('keeps the last row when a key somehow appears twice', () => {
		expect(
			resolvePreferences([
				{ key: 'notes.dock', value: true },
				{ key: 'notes.dock', value: false }
			])['notes.dock']
		).toBe(false);
	});
});
