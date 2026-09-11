import { z } from 'zod';
import { BADGE_TONES } from '$lib/components/ui/badge/badge-tones.js';
import { RECORD_KINDS } from '$lib/crm/records';

/**
 * The bodies `/api/notes` accepts.
 *
 * Not superforms schemas: a note has no form. It is created blank from the
 * dock and typed into, and the editor sends whole fields as they settle — the
 * one mutation in the app that is neither a page action nor a form post (see
 * `$lib/notes` for why it is an endpoint at all). Both route files validate
 * with these, so what the browser may write is stated once.
 */

/** Mirrors the `notes_title_length` / `notes_body_length` check constraints. */
export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 20000;

/** Blank is a title being cleared, which is a null column, not an empty one. */
const title = z
	.string()
	.trim()
	.max(NOTE_TITLE_MAX, `A title is at most ${NOTE_TITLE_MAX} characters.`)
	.transform((value) => (value === '' ? null : value))
	.nullable();

// Not trimmed: the body is a document, and someone in the middle of typing a
// list is entitled to their trailing newline.
const body = z.string().max(NOTE_BODY_MAX, 'That note is too long to save.');

/** The ten tones the app owns, which is exactly what the column holds. */
const color = z.enum(BADGE_TONES);

/**
 * What a note may be about. The record kinds with a page — the ones a note
 * can be written from — rather than every `crm_entity_type`; the database
 * trigger checks the row exists in the org either way.
 */
const entity = {
	entityType: z.enum(RECORD_KINDS),
	entityId: z.guid()
};

export const createNoteSchema = z
	.object({
		title: title.optional(),
		body: body.optional(),
		color: color.optional(),
		entityType: entity.entityType.optional(),
		entityId: entity.entityId.optional()
	})
	// The `notes_entity_link_complete` constraint, said in the one place that
	// can give the caller a sentence instead of a 500.
	.refine((value) => (value.entityType === undefined) === (value.entityId === undefined), {
		error: 'A note about a record needs both its kind and its id.'
	});

export const updateNoteSchema = z.object({
	title: title.optional(),
	body: body.optional(),
	color: color.optional(),
	/** Archiving is a boolean up here and a timestamp in the column. */
	archived: z.boolean().optional(),
	/** Where the note sits on the rail — `positionBetween()` in `$lib/notes` picks it. */
	position: z.number().finite().optional()
});

/** An edit, as `noteColumns()` in `$lib/server/notes` turns it into columns. */
export type UpdateNoteBody = z.infer<typeof updateNoteSchema>;
