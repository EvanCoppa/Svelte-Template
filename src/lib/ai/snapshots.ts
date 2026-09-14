import { isAssistantToolPart, type AssistantToolUIPart, type AssistantUIMessage } from './types';

/**
 * The records the thread has already read, so a change can be shown against
 * them. The instructions tell the model to read a record before it edits
 * one, and `getRecord`'s output carries the record's fields and the names
 * of the ones `updateRecord` accepts — so the thread itself holds the
 * "before" of every edit, and the approval card reads it back out of the
 * parts the way the sources rail does, never from a second fetch.
 */

type GetRecordOutput = Extract<
	AssistantToolUIPart,
	{ type: 'tool-getRecord'; state: 'output-available' }
>['output'];

/** One record as `getRecord` last returned it. */
export type RecordSnapshot = NonNullable<GetRecordOutput['record']>;

/** The `kind:id` key a snapshot is filed under. */
export function snapshotKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

/**
 * The latest reading of every record the thread opened, keyed by
 * `snapshotKey()`. Newest turn wins: a record read twice is shown as it was
 * last seen.
 */
export function recordSnapshots(
	messages: readonly AssistantUIMessage[]
): Map<string, RecordSnapshot> {
	const snapshots = new Map<string, RecordSnapshot>();
	for (const message of messages) {
		for (const part of message.parts) {
			if (!isAssistantToolPart(part)) continue;
			if (part.type !== 'tool-getRecord' || part.state !== 'output-available') continue;
			const { record } = part.output;
			if (record) snapshots.set(snapshotKey(record.kind, record.id), record);
		}
	}
	return snapshots;
}

/** One field of a proposed edit: what it is called, what it says now, what it would say. */
export type DiffRow = {
	name: string;
	label: string;
	before: string | null;
	after: string | null;
};

/**
 * A proposed edit as rows the card draws. The field's label and its current
 * value come from the snapshot when the thread has one; without it the row
 * still says what would be written, under the field's own name. A select's
 * option value is shown by its label, the way the form would show it, and a
 * blank means the field is cleared.
 */
export function diffRows(
	snapshot: RecordSnapshot | undefined,
	changes: Readonly<Record<string, string | undefined>>
): DiffRow[] {
	return Object.entries(changes).map(([name, value]) => {
		const editable = snapshot?.editableFields?.find((field) => field.name === name);
		const label = editable?.label ?? name;
		const before = snapshot?.fields.find((field) => field.label === label)?.value ?? null;
		const option = editable?.options?.find((candidate) => candidate.value === value);
		const after = value === undefined || value === '' ? null : (option?.label ?? value);
		return { name, label, before, after };
	});
}
