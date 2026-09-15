import { z } from 'zod';

/**
 * A slide deck's `deck_json`, validated at the boundary before it is saved.
 *
 * An org has one deck — how its slideshow is put together: which slides, in
 * what order, on which template, with what design and static copy. It holds
 * no proposal data; the presenter injects that at render time
 * (`$lib/slides/present`), so the same deck presents every proposal the org
 * sends.
 *
 * This is the freeform-content tier of the three-tier enforcement rule in
 * docs/proposals.md. The database guarantees only the envelope (an object
 * whose `slides` is an array); the shape of a slide is guaranteed here,
 * because a slide body is presentational structure no policy could check.
 */

/** Bumped when a stored deck needs migrating to a new slide shape. */
export const DECK_VERSION = 1;

/**
 * A runtime binding. The key it is stored under names a `text` entry, and
 * `sourceField` is a dot path resolved against the proposal being presented
 * ("client.name", "presenter.name" — the list is `BINDINGS` in
 * `$lib/slides/bindings`). The authored text stays as the fallback when the
 * path resolves to nothing, so a deck always renders.
 */
export const slideVariableSchema = z.object({
	sourceField: z
		.string()
		.trim()
		.min(1, 'A variable needs a source field.')
		.regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/i, 'Use a dot path, e.g. "client.name".')
});

/**
 * Everything the author sets on a slide. Every value is a string so the whole
 * content model round-trips through the editor's form controls unchanged;
 * unset keys fall back to the template's own defaults.
 */
export const slideContentSchema = z.object({
	/** Named text slots the template renders — heading, body, footnote. */
	text: z.record(z.string(), z.string()).default({}),
	/**
	 * Named image slots. URLs only: a data: URI would put megabytes of base64
	 * inside deck_json, which is read and rewritten on every save. An empty
	 * string is an unfilled slot.
	 */
	images: z
		.record(
			z.string(),
			z.union([
				z.literal(''),
				z.url('Images must be URLs.').refine((value) => !value.startsWith('data:'), {
					error: 'Images must be URLs, not inline data.'
				})
			])
		)
		.default({}),
	/** Per-slide colour overrides, as CSS values. */
	colors: z.record(z.string(), z.string()).default({}),
	/** Per-slide typography and layout overrides, as CSS-ish strings. */
	styles: z.record(z.string(), z.string()).default({}),
	/** Keyed by the `text` key each one fills at present time. */
	variables: z.record(z.string(), slideVariableSchema).default({})
});

/**
 * One slide. `templateId` names the component that renders it; the registry
 * of valid ids belongs to the slides module, so it is only shape-checked
 * here — an unknown id is the renderer's problem, not a reason to refuse a
 * save and lose the author's work.
 */
export const slideInstanceSchema = z.object({
	id: z.string().trim().min(1, 'Every slide needs an id.'),
	templateId: z.string().trim().min(1, 'Every slide needs a template.'),
	content: slideContentSchema
});

/** The whole `deck_json` column. */
export const slideDeckSchema = z
	.object({
		version: z.int().min(1).max(DECK_VERSION),
		slides: z.array(slideInstanceSchema).default([])
	})
	.refine((deck) => new Set(deck.slides.map((slide) => slide.id)).size === deck.slides.length, {
		error: 'Slide ids must be unique within a deck.',
		path: ['slides']
	});

export type SlideDeck = z.infer<typeof slideDeckSchema>;

/** What the builder posts: the deck, whole. */
export const slideBuilderSchema = z.object({ deck: slideDeckSchema });
