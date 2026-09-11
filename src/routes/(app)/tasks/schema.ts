import { z } from 'zod';
import { TASK_STATUSES } from '$lib/crm/tones';

/**
 * Moving a task to a column — the one write this page makes.
 *
 * A drag on the board, the keyboard's way across it and the checkbox in the
 * list all post this: they are the same act said three ways, and a task ends
 * up in a column whichever was used. Ticking the box is `status: 'done'`, and
 * the migration's trigger fills in `completed_at` — the page never sends a
 * timestamp, because when something was finished is not the browser's to say.
 */
export const moveTaskSchema = z.object({
	// `z.guid()` rather than `z.uuid()`, for the reason the staff schema gives:
	// seeded fixture ids do not carry RFC 4122 version bits.
	id: z.guid(),
	status: z.enum(TASK_STATUSES)
});
