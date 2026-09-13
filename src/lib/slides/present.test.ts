import { describe, expect, it } from 'vitest';
import { DECK_VERSION } from '$lib/schemas/decks';
import { defaultDeck } from './default-deck';
import { expandDeck, money, pairs, slideProps } from './present';
import { TEMPLATES, defaultContent, templateFor } from './registry';
import { samplePresentation } from './sample';
import type { SlideDeck, SlideInstance } from './types';

const presentation = samplePresentation({ name: 'Acme Inc' }, 'proposal', {
	presenter: 'Presenter',
	responsible: 'Provider'
});

function slide(
	templateId: string,
	overrides: Partial<SlideInstance['content']> = {}
): SlideInstance {
	const template = templateFor(templateId);
	if (!template) throw new Error(`no template ${templateId}`);
	return {
		id: `s-${templateId}`,
		templateId,
		content: { ...defaultContent(template), ...overrides }
	};
}

function deck(...slides: SlideInstance[]): SlideDeck {
	return { version: DECK_VERSION, slides };
}

describe('expandDeck', () => {
	it('repeats a per-option slide once per option, in order, and keeps the rest as one', () => {
		const shown = expandDeck(
			deck(slide('v1-title'), slide('option'), slide('thank-you-contact')),
			presentation
		);
		expect(shown.map((entry) => entry.key)).toEqual([
			's-v1-title',
			's-option:sample-1',
			's-option:sample-2',
			's-option:sample-3',
			's-thank-you-contact'
		]);
		expect(shown[1]?.option?.label).toBe('Essential');
		expect(shown[0]?.option).toBeNull();
	});

	it('shows nothing for a per-option slide when the proposal has no options', () => {
		expect(expandDeck(deck(slide('option')), { ...presentation, options: [] })).toEqual([]);
	});

	it('skips a slide whose template is no longer in the registry', () => {
		const stale: SlideInstance = {
			id: 'old',
			templateId: 'education',
			content: { text: {}, images: {}, colors: {}, styles: {}, variables: {} }
		};
		expect(expandDeck(deck(stale, slide('v1-title')), presentation)).toHaveLength(1);
	});
});

describe('slideProps', () => {
	it('fills the live value into a bound slot and keeps authored text where nothing binds', () => {
		const [shown] = expandDeck(
			deck(
				slide('v1-title', {
					text: { brandName: 'A proposal for you', subtitle: 'Custom line' },
					variables: { brandName: { sourceField: 'client.name' } }
				})
			),
			presentation
		);
		if (!shown) throw new Error('expected one slide');
		const props = slideProps(shown, presentation);
		expect(props.text.brandName).toBe('Jordan Rivera');
		expect(props.text.subtitle).toBe('Custom line');
	});

	it('falls back to the authored text, then the template default, when a binding resolves to nothing', () => {
		const unnamed = { ...presentation, presenter: null, org: { name: '' } };
		const [shown] = expandDeck(
			deck(
				slide('v1-title', {
					text: { brandName: 'Written by hand', subtitle: '' },
					variables: {
						brandName: { sourceField: 'presenter.name' },
						subtitle: { sourceField: 'org.name' }
					}
				})
			),
			unnamed
		);
		if (!shown) throw new Error('expected one slide');
		const props = slideProps(shown, unnamed);
		expect(props.text.brandName).toBe('Written by hand');
		expect(props.text.subtitle).toBe('Cityscape');
	});

	it('merges the template defaults under the authored colours and images', () => {
		const [shown] = expandDeck(
			deck(slide('two-col-image-text', { colors: { accentColor: '#ff0000' }, images: {} })),
			presentation
		);
		if (!shown) throw new Error('expected one slide');
		const props = slideProps(shown, presentation);
		expect(props.colors.accentColor).toBe('#ff0000');
		expect(props.colors.backgroundColor).toBe('#f8fafc');
		expect(props.images.image).toBe('');
		expect(props.styleVars).toBe('');
	});

	it('turns style overrides into CSS custom properties', () => {
		const [shown] = expandDeck(
			deck(
				slide('v1-title', {
					styles: { fontScale: '1.2', verticalAlign: 'top', fontWeight: 'bogus' }
				})
			),
			presentation
		);
		if (!shown) throw new Error('expected one slide');
		expect(slideProps(shown, presentation).styleVars).toBe(
			'--font-scale:1.2;--content-justify:flex-start'
		);
	});
});

describe('the default deck', () => {
	it('names only templates that exist and presents the decision start to finish', () => {
		const built = defaultDeck();
		expect(built.slides.map((entry) => entry.templateId)).toEqual([
			'v1-title',
			'option',
			'comparison',
			'next-steps',
			'thank-you-contact'
		]);
		expect(expandDeck(built, presentation)).toHaveLength(7);
	});

	it('binds the runtime slots Yes Smile bound, on the paths this proposal model has', () => {
		const built = defaultDeck();
		const cover = built.slides[0];
		expect(cover?.content.variables).toEqual({
			doctorName: { sourceField: 'responsible.name' },
			patientName: { sourceField: 'client.name' }
		});
		const [shown] = expandDeck(built, presentation);
		if (!shown) throw new Error('expected a cover');
		const props = slideProps(shown, presentation);
		expect(props.text.doctorName).toBe('Dr. Casey Morgan');
		expect(props.text.patientName).toBe('Jordan Rivera');
	});

	it('every template starts with every slot it declares', () => {
		for (const template of TEMPLATES) {
			const content = defaultContent(template);
			expect(Object.keys(content.text)).toEqual(template.text.map((field) => field.key));
			expect(Object.keys(content.colors)).toEqual(template.colors.map((color) => color.key));
			expect(Object.keys(content.images)).toEqual(template.images.map((slot) => slot.key));
		}
	});
});

describe('the registry', () => {
	it('carries every Yes Smile template except the education and AI ones', () => {
		const ids = TEMPLATES.map((template) => template.id);
		expect(ids).toContain('v1-pricing');
		expect(ids).toContain('three-video');
		expect(ids).toContain('aftercare-closer');
		expect(ids).not.toContain('education');
		expect(ids).not.toContain('ai-education');
		expect(ids).not.toContain('ai-faq');
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('repeats the pricing slide per option like the option slide', () => {
		expect(templateFor('v1-pricing')?.perOption).toBe(true);
		expect(expandDeck(deck(slide('v1-pricing')), presentation)).toHaveLength(3);
	});

	it('draws every toggle and number slot from a string default', () => {
		for (const template of TEMPLATES) {
			for (const field of template.text) {
				if (field.kind === 'toggle') expect(['true', 'false']).toContain(field.default);
				if (field.kind === 'number') expect(Number.isFinite(Number(field.default))).toBe(true);
			}
		}
	});
});

describe('helpers', () => {
	it('prints money in the option currency, whole units', () => {
		expect(money(1234.56, 'USD')).toBe('$1,235');
		expect(money(900, 'EUR')).toBe('€900');
	});

	it('splits "left | right" lines and tolerates a missing separator', () => {
		expect(pairs('Phone | 555\n\nEmail|a@b.c\nJust text')).toEqual([
			{ left: 'Phone', right: '555' },
			{ left: 'Email', right: 'a@b.c' },
			{ left: 'Just text', right: '' }
		]);
	});
});
