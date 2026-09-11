import { DECK_VERSION } from '$lib/schemas/decks';
import { type SlideTemplate, TEMPLATES, defaultContent } from './registry';
import type { SlideDeck, SlideInstance } from './types';

/**
 * The deck an org presents through until it saves one of its own: the
 * decision, start to finish, on every template's defaults. Built from the
 * registry so it can never name a template that does not exist.
 */

function slide(id: string, template: SlideTemplate): SlideInstance {
	return { id, templateId: template.id, content: defaultContent(template) };
}

export function defaultDeck(): SlideDeck {
	const templates = new Map(TEMPLATES.map((template) => [template.id, template]));
	const order = ['v1-title', 'option', 'comparison', 'next-steps', 'thank-you-contact'];
	return {
		version: DECK_VERSION,
		slides: order.flatMap((id, index) => {
			const template = templates.get(id);
			return template ? [slide(`default-${String(index + 1)}`, template)] : [];
		})
	};
}
