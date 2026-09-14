import { describe, expect, it } from 'vitest';
import type { GmailHistoryRecord } from '$lib/server/integrations/google/gmail';
import { foldHistory } from './worker';

const message = (id: string, labelIds?: string[]) => ({ id, threadId: `t-${id}`, labelIds });

describe('foldHistory', () => {
	it('collects added messages and drops the ones deleted later in the run', () => {
		const history: GmailHistoryRecord[] = [
			{ id: '1', messagesAdded: [{ message: message('a') }, { message: message('b') }] },
			{ id: '2', messagesDeleted: [{ message: message('a') }] }
		];
		const added = new Map<string, string>();
		const removed = new Set<string>();
		foldHistory(history, added, removed);
		expect([...added.keys()]).toEqual(['b']);
		expect([...removed]).toEqual(['a']);
	});

	it('treats a move to spam or the bin as a removal, and out of it as an addition', () => {
		const history: GmailHistoryRecord[] = [
			{ id: '1', labelsAdded: [{ message: message('a'), labelIds: ['TRASH'] }] },
			{ id: '2', labelsRemoved: [{ message: message('b'), labelIds: ['SPAM'] }] },
			{ id: '3', labelsAdded: [{ message: message('c'), labelIds: ['STARRED'] }] }
		];
		const added = new Map<string, string>();
		const removed = new Set<string>();
		foldHistory(history, added, removed);
		expect([...added.keys()]).toEqual(['b']);
		expect([...removed]).toEqual(['a']);
	});

	it('never adds a message that arrived already binned', () => {
		const added = new Map<string, string>();
		const removed = new Set<string>();
		foldHistory(
			[{ id: '1', messagesAdded: [{ message: message('a', ['TRASH']) }] }],
			added,
			removed
		);
		expect(added.size).toBe(0);
	});

	it('lets a restore after a delete win', () => {
		const added = new Map<string, string>();
		const removed = new Set<string>();
		foldHistory(
			[
				{ id: '1', labelsAdded: [{ message: message('a'), labelIds: ['TRASH'] }] },
				{ id: '2', labelsRemoved: [{ message: message('a'), labelIds: ['TRASH'] }] }
			],
			added,
			removed
		);
		expect([...added.keys()]).toEqual(['a']);
		expect(removed.size).toBe(0);
	});
});
