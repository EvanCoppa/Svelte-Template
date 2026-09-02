import { describe, expect, it } from 'vitest';
import { diffMaps, diffSets } from './admin';

describe('diffSets', () => {
	it('adds what is wanted but missing and removes what is held but unwanted', () => {
		expect(diffSets(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
	});

	it('is a no-op for equal sets, duplicates included', () => {
		expect(diffSets(['a', 'a', 'b'], ['b', 'a'])).toEqual({ add: [], remove: [] });
	});
});

describe('diffMaps', () => {
	it('writes new and changed entries and drops absent ones', () => {
		const current = new Map([
			['clients', 'read'],
			['deals', 'manage'],
			['tasks', 'read']
		]);
		const wanted = new Map([
			['clients', 'read'],
			['deals', 'delete'],
			['tickets', 'read']
		]);
		expect(diffMaps(current, wanted)).toEqual({
			upsert: [
				['deals', 'delete'],
				['tickets', 'read']
			],
			remove: ['tasks']
		});
	});
});
