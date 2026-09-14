import { z } from 'zod';

/**
 * What a page's body IS, and what its editor posts.
 *
 * The schema lives here rather than beside the reader because it is the
 * reader: `$lib/crm/documents` parses the column through
 * `documentBodySchema` exactly as `$lib/whiteboard/scene` parses a stored
 * scene — one decoder at the I/O boundary, never a hand-rolled walk over an
 * unparsed value.
 *
 * The body travels to the server as a JSON STRING in a hidden input, because
 * that is what a form field is — the calendar's drag-to-move road (CLAUDE.md,
 * "Server actions vs API endpoints"): a mutation born in a gesture on the
 * page it lives on is still a form action, filled from script and submitted
 * with `requestSubmit()`, never a `fetch` of its own.
 */

/** The envelope's version. Bump only when old bodies need reading differently. */
export const DOCUMENT_BODY_VERSION = 1;

/**
 * One block: a type, and whatever that type's data is.
 *
 * The data is deliberately NOT described. The moment this file starts listing
 * block types, shipping a new one becomes a schema change — and worse, a body
 * written by a newer tab would be REFUSED, which is how somebody loses an
 * afternoon's writing. `z.json()` rather than `unknown` so what comes out is a
 * value the `jsonb` column's own type accepts with no cast at the call site.
 */
export const blockSchema = z.object({
	id: z.string().max(64).optional(),
	type: z.string().min(1).max(64),
	data: z.record(z.string(), z.json())
});

export const documentBodySchema = z.object({
	version: z.number().int().min(1).default(DOCUMENT_BODY_VERSION),
	blocks: z.array(blockSchema).max(2000, 'That is more blocks than a page can hold.')
});

/**
 * The same envelope, read leniently: the blocks come back unparsed so the
 * reader can keep the ones that decode and drop the ones that do not.
 *
 * Strict on the way IN (`documentBodySchema`, above) and lenient on the way
 * OUT is the whole point — nonsense is refused at the door, but one block
 * this version cannot read must never cost somebody the other forty.
 */
export const documentBodyReadSchema = z.object({
	version: z.number().int().min(1).default(DOCUMENT_BODY_VERSION),
	blocks: z.array(z.json()).default([])
});

export type DocumentBlock = z.infer<typeof blockSchema>;
export type DocumentBody = z.infer<typeof documentBodySchema>;

/**
 * Every string anywhere inside a value — the words of a block, and the markup
 * around them.
 *
 * A decoder rather than a recursive walk with `typeof` in it: the union says
 * what each shape IS and the transforms fold it, so the discrimination is the
 * schema's rather than something this module re-derives. Anything that is not
 * a string, an array or an object contributes nothing, which is right — a
 * number in a block's data is a setting, not prose.
 */
export const stringsInSchema: z.ZodType<string[], unknown> = z.lazy(() =>
	z.union([
		z.string().transform((value) => [value]),
		z.array(stringsInSchema).transform((values) => values.flat()),
		z.record(z.string(), stringsInSchema).transform((value) => Object.values(value).flat()),
		z.unknown().transform((): string[] => [])
	])
);

/** The column's cap, mirrored here so an oversized body fails in the form. */
const BODY_LIMIT = 1_048_576;

/** The editor's save: the two header fields, and the body as JSON. */
export const documentSaveSchema = z.object({
	title: z.string().trim().max(200, 'A name is 200 characters or fewer.').default(''),
	icon: z.string().trim().max(16, 'One character or emoji is enough.').default(''),
	body: z.string().max(BODY_LIMIT, 'This page is too long to save.').default('')
});

/**
 * The posted body string as blocks. Returns null when it is not a body this
 * app can store — the action turns that into a form message, never a throw:
 * the browser is the only holder of the writing at that moment.
 */
export function parseDocumentBody(value: string): DocumentBody | null {
	if (value.trim() === '') return { version: DOCUMENT_BODY_VERSION, blocks: [] };
	const parsed = z
		.string()
		.transform((raw, context) => {
			try {
				const decoded: unknown = JSON.parse(raw);
				return decoded;
			} catch {
				context.addIssue({ code: 'custom', message: 'That is not a page body.' });
				return z.NEVER;
			}
		})
		.pipe(documentBodySchema)
		.safeParse(value);
	return parsed.success ? parsed.data : null;
}
