import { describe, expect, it } from 'vitest';
import { visibleTerms } from './terms';
import type { FeatureMap, FeatureMode } from './types';

function map(
	entries: [id: string, mode: FeatureMode, name: string, noun: string | null][]
): FeatureMap {
	return Object.fromEntries(
		entries.map(([id, mode, name, noun]) => [
			id,
			{
				mode,
				feature: {
					id,
					name,
					noun,
					description: null,
					route: `/${id}`,
					icon: null,
					category: 'crm',
					sort_order: 0,
					created_at: ''
				}
			}
		])
	);
}

describe('visibleTerms', () => {
	const features = map([
		['proposals', 'enabled', 'Treatment plans', 'treatment plan'],
		['deals', 'locked_visible', 'Deals', 'deal'],
		['staff', 'enabled', 'Staff', null],
		['tasks', 'disabled', 'Tasks', 'task'],
		['tickets', 'hidden', 'Tickets', 'ticket']
	]);

	it('names exactly the features the nav would show, with the words as resolved', () => {
		expect(visibleTerms(features, () => true)).toEqual({
			proposals: { name: 'Treatment plans', noun: 'treatment plan' },
			deals: { name: 'Deals', noun: 'deal' },
			staff: { name: 'Staff', noun: null }
		});
	});

	it('leaves out a feature the caller cannot read, locked ones included', () => {
		expect(Object.keys(visibleTerms(features, (id) => id === 'proposals'))).toEqual(['proposals']);
	});

	it('is empty for an empty map', () => {
		expect(visibleTerms({}, () => true)).toEqual({});
	});
});
