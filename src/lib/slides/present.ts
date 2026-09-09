import { bindingValue } from './bindings';
import { type SlideTemplate, templateFor } from './registry';
import { slideStyleVars } from './styles';
import type {
	Presentation,
	PresentationOption,
	SlideDeck,
	SlideInstance,
	SlideProps
} from './types';

/**
 * From a deck and a presentation to the slides on screen. Two pure steps:
 *
 *   expandDeck()  — the authored list becomes the shown list: a slide whose
 *                   template is per-option is repeated once per option, in
 *                   order; a slide on a template the registry no longer has
 *                   is skipped rather than crashing the show.
 *   slideProps()  — one shown slide becomes its template's props: the
 *                   template's defaults filled in under the authored content,
 *                   every bound text slot replaced by the live value when the
 *                   presentation has one, the style overrides as CSS vars.
 *
 * The builder and the presenter both go through these, so what the author
 * sees in the preview (over a sample presentation) is what the client sees.
 */

export type ShownSlide = {
	/** Unique on screen — a per-option slide gets one per option. */
	key: string;
	slide: SlideInstance;
	template: SlideTemplate;
	option: PresentationOption | null;
};

export function expandDeck(deck: SlideDeck, presentation: Presentation): ShownSlide[] {
	return deck.slides.flatMap((slide): ShownSlide[] => {
		const template = templateFor(slide.templateId);
		if (!template) return [];
		if (!template.perOption) return [{ key: slide.id, slide, template, option: null }];
		return presentation.options.map((option) => ({
			key: `${slide.id}:${option.id}`,
			slide,
			template,
			option
		}));
	});
}

export function slideProps(
	{ slide, template, option }: ShownSlide,
	presentation: Presentation
): SlideProps {
	const text: Record<string, string> = {};
	for (const field of template.text) {
		const authored = slide.content.text[field.key];
		const bound = slide.content.variables[field.key]?.sourceField;
		// A bound slot shows the live value; an empty one (no client named
		// yet) falls back to what the author typed, then to the default.
		const live = bound ? bindingValue(presentation, bound) : null;
		text[field.key] = live || authored || field.default;
	}
	const images: Record<string, string> = {};
	for (const slot of template.images) images[slot.key] = slide.content.images[slot.key] ?? '';
	const colors: Record<string, string> = {};
	for (const color of template.colors) {
		colors[color.key] = slide.content.colors[color.key] || color.default;
	}
	return {
		text,
		images,
		colors,
		styleVars: slideStyleVars(slide.content.styles),
		presentation,
		option
	};
}

/** A figure in the option's currency, whole units — what a slide prints. */
export function money(value: number, currency: string): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		maximumFractionDigits: 0
	}).format(value);
}

/**
 * A multiline slot typed as "left | right" per line, split. Blank lines are
 * dropped and a line with no separator keeps its whole text on the left.
 */
export function pairs(raw: string): { left: string; right: string }[] {
	return raw
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const at = line.indexOf('|');
			return at === -1
				? { left: line, right: '' }
				: { left: line.slice(0, at).trim(), right: line.slice(at + 1).trim() };
		});
}
