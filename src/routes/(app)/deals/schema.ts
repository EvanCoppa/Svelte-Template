import { z } from 'zod';

/**
 * The one write this page makes in place: a deal moved to another stage.
 *
 * Its own schema rather than a share of the record form's, for the reason the
 * task board's `move` has one — this is a single act a card offers where it
 * sits, and a form that could also change the title and the amount would make
 * every one of those fields optional on every drop.
 *
 * Editing the rest of a deal is the record page's job, through the generic
 * record form, where the stage is a field like any other.
 */

// `z.guid()` rather than `z.uuid()`, for the reason the staff schema gives:
// seeded fixture ids do not carry RFC 4122 version bits.
export const moveDealSchema = z.object({
	id: z.guid(),
	/**
	 * Where it landed. A stage, never a column's own id — on this board the two
	 * are the same thing (a column is one stage), and the board only ever hands
	 * back a status. The pipeline is looked up from it server-side: a stage only
	 * means something inside its own board, so the two ids always move together.
	 */
	stage_id: z.guid()
});
