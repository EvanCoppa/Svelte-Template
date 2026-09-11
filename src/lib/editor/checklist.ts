/**
 * Checklists in a note, which are a text convention rather than a data model.
 *
 * `- [ ] call John` is what gets stored, because the body is the source of
 * truth and stays exactly what was typed (docs/antinote-in-notes.md). Ticking
 * a box therefore rewrites **one character** at a known offset and lets the
 * editor's ordinary autosave carry it — the only write this whole layer makes
 * to a note, and small enough that it cannot disturb a caret somewhere else
 * on the line.
 *
 * Pure, like `./compute`: no DOM, no `$app/*`.
 */

/** `- [ ] thing` / `* [x] thing`, with whatever indentation it was written at. */
const ITEM = /^(\s*[-*]\s*\[)([ xX])(\].*)$/;

export type ChecklistItem = { checked: boolean };

/** Whether a line is a checklist item, and whether it is ticked. */
export function checklistItem(line: string): ChecklistItem | null {
	const match = ITEM.exec(line);
	if (!match) return null;
	return { checked: match[2].toLowerCase() === 'x' };
}

/**
 * The body with the box on `index` flipped. Returns the body unchanged when
 * that line is not an item, so a stale click after an edit is a no-op rather
 * than a corruption.
 */
export function toggleChecklistItem(body: string, index: number): string {
	const lines = body.split('\n');
	const line = lines[index];
	if (line === undefined) return body;

	const match = ITEM.exec(line);
	if (!match) return body;

	lines[index] = `${match[1]}${match[2].toLowerCase() === 'x' ? ' ' : 'x'}${match[3]}`;
	return lines.join('\n');
}
