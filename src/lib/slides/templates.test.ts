import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { DECK_VERSION } from '$lib/schemas/decks';
import { expandDeck, slideProps } from './present';
import { TEMPLATES, defaultContent } from './registry';
import { samplePresentation } from './sample';

/**
 * Every ported template draws on its defaults over the sample presentation —
 * the builder's picker does exactly this for each card, so a template that
 * throws here is one the builder cannot show.
 */
const presentation = samplePresentation({ name: 'Acme Inc' }, 'proposal', {
	presenter: 'Presenter',
	responsible: 'Provider'
});

describe('the templates', () => {
	it.each(TEMPLATES.map((template) => [template.id, template]))(
		'%s renders on its defaults',
		(_, template) => {
			const deck = {
				version: DECK_VERSION,
				slides: [
					{ id: `t-${template.id}`, templateId: template.id, content: defaultContent(template) }
				]
			};
			const shown = expandDeck(deck, presentation);
			expect(shown.length).toBeGreaterThan(0);
			for (const entry of shown) {
				const { body } = render(template.Component, { props: slideProps(entry, presentation) });
				expect(body.length).toBeGreaterThan(100);
			}
		}
	);

	it('prices the option it is handed, and marks the discount off the lines', () => {
		const template = TEMPLATES.find((entry) => entry.id === 'v1-pricing');
		if (!template) throw new Error('no pricing template');
		const content = defaultContent(template);
		const discounted = {
			...presentation,
			options: [{ ...presentation.options[1]!, total: 7000 }]
		};
		const [shown] = expandDeck(
			{ version: DECK_VERSION, slides: [{ id: 'p', templateId: 'v1-pricing', content }] },
			discounted
		);
		if (!shown) throw new Error('expected one slide');
		const { body } = render(template.Component, { props: slideProps(shown, discounted) });
		expect(body).toContain('Complete');
		expect(body).toContain('$7,900');
		expect(body).toContain('Discount: - $900');
		expect(body).toContain('Your Price:');
		expect(body).toContain('12 months: $583 per month');
		expect(body).toContain('Prepayment or Cash Payment: $6,300');
	});

	it('badges a catalog product the plan already includes', () => {
		const template = TEMPLATES.find((entry) => entry.id === 'v1-products');
		if (!template) throw new Error('no products template');
		const [shown] = expandDeck(
			{
				version: DECK_VERSION,
				slides: [{ id: 'p', templateId: 'v1-products', content: defaultContent(template) }]
			},
			presentation
		);
		if (!shown) throw new Error('expected one slide');
		const { body } = render(template.Component, { props: slideProps(shown, presentation) });
		expect(body).toContain('✓ In your plan');
		expect(body).toContain('Ask us about this');
		expect(body).toContain('Night guard');
	});
});
