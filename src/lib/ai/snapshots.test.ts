import { describe, expect, it } from 'vitest';
import { diffRows, recordSnapshots, snapshotKey, type RecordSnapshot } from './snapshots';
import type { AssistantUIMessage } from './types';

/**
 * The approval card reads a record's "before" back out of the thread — the
 * `getRecord` the model ran before proposing the edit — and names the field
 * as the form would.
 */

const CONTACT_ID = '30000000-0000-0000-0000-000000000001';

const lucius: RecordSnapshot = {
	kind: 'contact',
	id: CONTACT_ID,
	name: 'Lucius Fox',
	status: ['Active'],
	fields: [
		{ label: 'Title', value: 'CEO' },
		{ label: 'Status', value: 'active' }
	],
	customFields: [],
	tags: [],
	createdAt: '2026-09-01T09:00:00Z',
	updatedAt: '2026-09-01T09:00:00Z',
	editableFields: [
		{ name: 'title', label: 'Title', type: 'text', required: false },
		{
			name: 'status',
			label: 'Status',
			type: 'select',
			required: false,
			options: [
				{ value: 'active', label: 'Active' },
				{ value: 'inactive', label: 'Inactive' }
			]
		}
	]
};

function read(record: RecordSnapshot, id: string): AssistantUIMessage {
	return {
		id,
		role: 'assistant',
		parts: [
			{
				type: 'tool-getRecord',
				toolCallId: `call-${id}`,
				state: 'output-available',
				input: { kind: record.kind, id: record.id },
				output: { found: true, record, related: [], relationships: [], activities: [] }
			}
		]
	};
}

describe('recordSnapshots', () => {
	it('keeps the latest reading of each record the thread opened', () => {
		const later = { ...lucius, fields: [{ label: 'Title', value: 'CTO' }] };
		const snapshots = recordSnapshots([read(lucius, 'a1'), read(later, 'a2')]);
		expect(snapshots.size).toBe(1);
		expect(snapshots.get(snapshotKey('contact', CONTACT_ID))?.fields[0]?.value).toBe('CTO');
	});

	it('ignores a read that has not settled or found nothing', () => {
		const pending: AssistantUIMessage = {
			id: 'a3',
			role: 'assistant',
			parts: [
				{
					type: 'tool-getRecord',
					toolCallId: 'c3',
					state: 'input-available',
					input: { kind: 'contact', id: CONTACT_ID }
				}
			]
		};
		expect(recordSnapshots([pending]).size).toBe(0);
	});
});

describe('diffRows', () => {
	it('names the field as the form does and shows its current value beside the new one', () => {
		expect(diffRows(lucius, { title: 'CTO', status: 'inactive' })).toEqual([
			{ name: 'title', label: 'Title', before: 'CEO', after: 'CTO' },
			{ name: 'status', label: 'Status', before: 'active', after: 'Inactive' }
		]);
	});

	it('reads a blank as clearing the field', () => {
		expect(diffRows(lucius, { title: '' })).toEqual([
			{ name: 'title', label: 'Title', before: 'CEO', after: null }
		]);
	});

	it('still says what would be written when the thread never read the record', () => {
		expect(diffRows(undefined, { title: 'CTO' })).toEqual([
			{ name: 'title', label: 'title', before: null, after: 'CTO' }
		]);
	});
});
