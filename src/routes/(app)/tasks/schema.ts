import { z } from 'zod';
import { TASK_STATUSES } from '$lib/crm/tones';
import { optionalInstant } from '$lib/schemas/records';

/**
 * The four writes this page makes, one schema each. They are separate forms
 * rather than one "edit a task" form on purpose: each is a single act a card
 * offers in place — moving it, giving it a day, saying how urgent it is, and
 * putting somebody on it — and a shared schema would make three of the four
 * fields optional on every post, which is how a blank field starts clearing a
 * column nobody touched.
 *
 * Editing the rest of a task is the record page's job, not a card's.
 */

// `z.guid()` rather than `z.uuid()`, for the reason the staff schema gives:
// seeded fixture ids do not carry RFC 4122 version bits.
const recordId = z.guid();

/**
 * Moving a task to a status.
 *
 * A drag on the board, the keyboard's way across it and the checkbox in the
 * list all post this: they are the same act said three ways, and a task ends
 * up in a status whichever was used. Ticking the box is `status: 'done'`, and
 * the migration's trigger fills in `completed_at` — the page never sends a
 * timestamp, because when something was finished is not the browser's to say.
 *
 * What is posted is always a **status**, never the board's column: a group is
 * a way of reading the board and not a state a task can be in, which is why a
 * grouped column asks which of its statuses a drop meant.
 */
export const moveTaskSchema = z.object({
	id: recordId,
	status: z.enum(TASK_STATUSES)
});

/**
 * Giving a task a day, or taking it away again. Blank is a real answer —
 * "no due date" is a state the list has a pile for — so it clears the column
 * rather than failing validation.
 */
export const scheduleTaskSchema = z.object({
	id: recordId,
	due_at: optionalInstant
});

/** How urgent a task is. One of the four the app's one priority vocabulary names. */
export const prioritizeTaskSchema = z.object({
	id: recordId,
	priority: z.enum(['low', 'normal', 'high', 'urgent'])
});

/**
 * Putting somebody on a task, or taking them off it. Assignment is a
 * relationship, so adding names the person and removing names the row — ending
 * an assignment keeps who held it, and a task can have several people on it at
 * once (docs/tasks.md).
 */
export const assignTaskSchema = z.object({
	id: recordId,
	user_id: z.guid()
});

export const unassignTaskSchema = z.object({
	/** The `assigned_to` relationship's id, which is what ending one needs. */
	assignment_id: recordId
});
