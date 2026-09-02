import { describe, expect, it } from 'vitest';
import { pairKey, splitPair } from './pairs';

describe('pair keys', () => {
	it('round-trip a feature id with a second id', () => {
		expect(splitPair(pairKey('best-practices', 'enterprise'))).toEqual([
			'best-practices',
			'enterprise'
		]);
	});

	it('reject anything that is not two non-empty ids', () => {
		expect(splitPair('clients')).toBeNull();
		expect(splitPair('|pro')).toBeNull();
		expect(splitPair('clients|')).toBeNull();
	});
});
