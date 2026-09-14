import { describe, expect, it } from 'vitest';
import { sourcesOf } from './sources';
import type { AssistantUIMessage } from './types';

/**
 * The context rail reads the records an answer drew on back out of the
 * thread's tool parts: every kind-addressed tool names what it found, a
 * member is never a source (no page), and the same record found twice is
 * one source.
 */

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';
const CONTACT_ID = '30000000-0000-0000-0000-000000000001';

const wayne = { kind: 'company' as const, id: COMPANY_ID, name: 'Wayne Enterprises' };
const lucius = { kind: 'contact' as const, id: CONTACT_ID, name: 'Lucius Fox' };

const answer: AssistantUIMessage = {
	id: 'a1',
	role: 'assistant',
	parts: [
		{
			type: 'tool-findRecords',
			toolCallId: 'c1',
			state: 'output-available',
			input: { kind: 'company', limit: 20 },
			output: {
				kind: 'company',
				records: [{ id: COMPANY_ID, name: 'Wayne Enterprises' }],
				total: 1
			}
		},
		{
			type: 'tool-getRecord',
			toolCallId: 'c2',
			state: 'output-available',
			input: { kind: 'contact', id: CONTACT_ID },
			output: {
				found: true,
				record: {
					...lucius,
					status: ['Active'],
					fields: [{ label: 'Company', value: 'Wayne Enterprises', record: wayne }],
					customFields: [],
					tags: [],
					createdAt: '2026-09-01T09:00:00Z',
					updatedAt: '2026-09-01T09:00:00Z'
				},
				related: [
					{ kind: 'deal', records: [{ id: 'd1', name: 'Renewal', status: null, meta: null }] }
				],
				relationships: [
					{
						id: 'r1',
						typeId: 't1',
						label: 'assigned to',
						direction: 'forward',
						other: { kind: 'member', id: 'u1', name: 'Dev' },
						startedOn: null,
						endedOn: null,
						notes: null
					}
				],
				activities: []
			}
		},
		{
			type: 'tool-exploreGraph',
			toolCallId: 'c3',
			state: 'output-available',
			input: { kind: 'company', id: COMPANY_ID, depth: 2, includeEnded: false },
			output: {
				found: true,
				nodes: [
					{
						id: `company:${COMPANY_ID}`,
						kind: 'company',
						recordId: COMPANY_ID,
						name: 'Wayne Enterprises',
						depth: 0
					},
					{ id: 'member:u1', kind: 'member', recordId: 'u1', name: 'Dev', depth: 1 },
					{ id: 'task:t9', kind: 'task', recordId: 't9', name: 'Call back', depth: 1 }
				],
				edges: [],
				truncated: false
			}
		}
	]
};

describe('sourcesOf', () => {
	it('names every record the kind-addressed tools found, once, and never a member', () => {
		expect(sourcesOf([answer])).toEqual([
			wayne,
			lucius,
			{ kind: 'deal', id: 'd1', name: 'Renewal' },
			{ kind: 'task', id: 't9', name: 'Call back' }
		]);
	});

	it('skips a call that has not settled', () => {
		const pending: AssistantUIMessage = {
			id: 'a2',
			role: 'assistant',
			parts: [
				{
					type: 'tool-findRecords',
					toolCallId: 'c4',
					state: 'input-available',
					input: { kind: 'company', limit: 20 }
				}
			]
		};
		expect(sourcesOf([pending])).toEqual([]);
	});
});
