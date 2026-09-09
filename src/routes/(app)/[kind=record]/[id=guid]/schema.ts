import { z } from 'zod';

/**
 * What the custom field editor posts: which field, and what to put in it.
 *
 * One field at a time, so the schema is flat and static — only WHICH field it
 * addresses is dynamic, and that is a hidden id, the way the quick plans
 * dialogs address a bundle. A field-per-key schema would have to be built per
 * request, which costs the no-JS path, an inline error next to the input, and
 * a test that can post a real `FormData`.
 *
 * The value is a string like every field of the generic record form; the
 * action checks it against the definition's own type (`customFieldValueSchema`
 * in `$lib/crm/custom-fields`), where that type is known, and
 * `customFieldColumns()` turns it into the one column that carries it.
 *
 * Blank is legal and means "clear it": the row goes rather than holding an
 * empty string that three of the five types cannot represent.
 */
export const customFieldValueFormSchema = z.object({
	field_definition_id: z.guid(),
	value: z.string().trim().max(2000, 'Must be 2000 characters or fewer.').default('')
});
