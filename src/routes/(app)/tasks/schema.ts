import { z } from 'zod';
import { TASK_STATUSES } from '$lib/crm/tones';
import { recordRefField } from '$lib/schemas/record-ref';
import { optionalInstant } from '$lib/schemas/records';

/**
 * The writes this page makes, one schema each: creating a task (at the
 * bottom), and the four small acts a card offers in place — moving it, giving
 * it a day, saying how urgent it is, and putting somebody on it. They are
 * separate forms rather than one "edit a task" form on purpose: a shared
 * schema would make most fields optional on every post, which is how a blank
 * field starts clearing a column nobody touched.
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

/**
 * Creating a task, from the task modal (`create-task.svelte`).
 *
 * This is the one kind of record that does not go through the generic
 * `CreateRecord` form, and the reason is the row it writes is not the whole
 * act: who is on a task is a relationship (docs/tasks.md), so the modal
 * writes the row AND its `assigned_to` rows in one post, and what the task
 * is about is a party — a company or a person — chosen from one picker
 * rather than two fields. The rest of a task (details, priority) is edited
 * on its record page, through the generic form, where it always was.
 *
 * `assignees` posts as one `assignees` input per person, which is what
 * superforms reads an array of strings from. `record` is the shared
 * `<kind>:<id>` spelling (`$lib/schemas/record-ref`).
 */
export const createTaskSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, 'Give the task a title.')
		.max(200, 'Keep the title under 200 characters.'),
	due_at: optionalInstant,
	assignees: z.array(z.guid()).default([]),
	record: recordRefField
});

export type CreateTaskValues = z.infer<typeof createTaskSchema>;
