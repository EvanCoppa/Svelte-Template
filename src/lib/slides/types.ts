import type { z } from 'zod';
import type { slideContentSchema, slideInstanceSchema } from '$lib/schemas/decks';

/**
 * What the slides layer works with. Everything under `src/lib/slides/` sees
 * exactly two things: a deck (how the slideshow is put together — the
 * shapes in `$lib/schemas/decks`) and a `Presentation` (the one proposal
 * being shown, already read and named). Nothing here touches a database or
 * a session; the server builds a Presentation in
 * `$lib/server/crm/slides.ts` and the builder renders a sample one.
 */

export type SlideContent = z.infer<typeof slideContentSchema>;
export type SlideInstance = z.infer<typeof slideInstanceSchema>;
export type { SlideDeck } from '$lib/schemas/decks';

/** One itemised line inside an option, priced as it was picked. */
export type PresentationLine = {
	label: string;
	/** The units the line covers as typed — "12, 13", "Upper" — or nothing. */
	detail: string | null;
	quantity: number;
	unitCost: number;
	total: number;
	/** The catalog product the line was picked from, when it was — provenance, like the column. */
	productId: string | null;
};

/** One row of the org's catalog, as the products slide shows it. */
export type PresentationProduct = {
	id: string;
	sku: string | null;
	name: string;
	description: string | null;
	price: number;
	currency: string;
};

/** One column of the decision — a priced, timed choice. */
export type PresentationOption = {
	id: string;
	label: string;
	recommended: boolean;
	/** The stored figure, from `computed_total`; never client math. */
	total: number;
	currency: string;
	/** "6 months", "3 visits" — or null when the option names no duration. */
	duration: string | null;
	/** "12 months at 4.99% APR", "Financing available" — or null. */
	financing: string | null;
	lines: PresentationLine[];
	/** The org's own comparison rows, as text: "Warranty (years)" → "5". */
	fields: { label: string; value: string }[];
};

/** Everything a slide may say about the proposal being presented. */
export type Presentation = {
	org: { name: string };
	proposal: {
		id: string;
		title: string;
		/** The proposal's noun as the industry says it: "quote", "treatment plan". */
		noun: string;
		/** When it was made, formatted for the reader. */
		date: string;
		validUntil: string | null;
	};
	/** The record the proposal is for — a contact, company or deal — or nobody yet. */
	client: { name: string } | null;
	presenter: { name: string } | null;
	responsible: { name: string } | null;
	/** What the two people are called in this industry: "Presenter" / "Provider". */
	labels: { presenter: string; responsible: string };
	options: PresentationOption[];
	/** The org's active catalog, in name order — what the products slide offers. */
	products: PresentationProduct[];
};

/**
 * What every template receives — the same six props whatever the template.
 * `text`, `images` and `colors` are the authored content with the
 * template's defaults filled in and variables resolved; `option` is set only
 * for a slide that repeats per option.
 */
export type SlideProps = {
	text: Record<string, string>;
	images: Record<string, string>;
	colors: Record<string, string>;
	styleVars: string;
	presentation: Presentation;
	option: PresentationOption | null;
};
