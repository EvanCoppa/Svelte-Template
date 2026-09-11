import { z } from 'zod';

/**
 * The conversation on a record — posting a message, editing one, removing
 * one. It lives here rather than beside the page for the reason the address
 * schema does: `Detail.Thread` renders these forms and the record page's
 * actions validate with them, so neither owns the shape.
 *
 * `id` is blank when posting and the message's id when editing, the one-form
 * pattern the address form uses.
 */

export const taskCommentSchema = z.object({
	id: z.guid().or(z.literal('')).default(''),
	body: z
		.string()
		.trim()
		.min(1, 'Write something first.')
		.max(5000, 'Must be 5000 characters or fewer.')
});

export const removeTaskCommentSchema = z.object({
	id: z.guid()
});
