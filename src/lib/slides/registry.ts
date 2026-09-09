import type { Component } from 'svelte';
import type { BindingPath } from './bindings';
import { type StyleControl, TEXT_STYLE_CONTROLS, TITLE_STYLE_CONTROLS } from './styles';
import Comparison from './templates/comparison.svelte';
import Cover from './templates/cover.svelte';
import NextSteps from './templates/next-steps.svelte';
import Option from './templates/option.svelte';
import Section from './templates/section.svelte';
import ThankYou from './templates/thank-you.svelte';
import TwoColumn from './templates/two-column.svelte';
import { SLIDE_THEME } from './theme';
import type { SlideContent, SlideProps } from './types';

/**
 * The templates a slide can use. One entry per template: the component
 * that draws it and the slots the builder edits — every text slot with its
 * label and default, every image slot, every colour — so the editor renders
 * any template from this list and no template needs a screen of its own.
 * A template marked `perOption` is repeated once per proposal option when
 * the deck is presented (`present.ts`).
 */

export type TextField = {
	key: string;
	label: string;
	default: string;
	/** A paragraph, or a list typed one item per line. */
	multiline?: boolean;
	/** Filled from the proposal at present time unless the author unbinds it. */
	binding?: BindingPath;
};

export type ImageSlot = { key: string; label: string; description?: string };

export type ColorField = { key: string; label: string; default: string };

export type SlideTemplate = {
	id: string;
	title: string;
	description: string;
	Component: Component<SlideProps>;
	perOption: boolean;
	text: TextField[];
	images: ImageSlot[];
	colors: ColorField[];
	styleControls: StyleControl[];
};

const light: ColorField[] = [
	{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
	{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
	{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
	{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
];

const dark: ColorField[] = [
	{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.heading },
	{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.onAccent },
	{ key: 'textColor', label: 'Text', default: SLIDE_THEME.onDarkMuted },
	{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
];

export const TEMPLATES: SlideTemplate[] = [
	{
		id: 'cover',
		title: 'Cover',
		description: 'Opens the show: the proposal, who it is for and who is presenting.',
		Component: Cover,
		perOption: false,
		text: [
			{
				key: 'heading',
				label: 'Heading',
				default: 'A proposal for you',
				binding: 'proposal.title'
			},
			{ key: 'subheading', label: 'Subheading', default: 'Prepared with care', binding: 'org.name' }
		],
		images: [
			{
				key: 'backgroundImage',
				label: 'Background image',
				description: 'Sits behind a dark scrim.'
			},
			{ key: 'logo', label: 'Logo' }
		],
		colors: dark,
		styleControls: TITLE_STYLE_CONTROLS
	},
	{
		id: 'section',
		title: 'Section divider',
		description: 'A numbered chapter break with an optional side photo.',
		Component: Section,
		perOption: false,
		text: [
			{ key: 'sectionNumber', label: 'Number', default: '01' },
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Section' },
			{ key: 'heading', label: 'Heading', default: 'What we recommend' },
			{ key: 'subheading', label: 'Subheading', default: '' }
		],
		images: [{ key: 'image', label: 'Side photo', description: 'Fills the angled right panel.' }],
		colors: dark,
		styleControls: TITLE_STYLE_CONTROLS
	},
	{
		id: 'option',
		title: 'Option',
		description: 'One slide per option: its lines, its total, how long and how it can be paid.',
		Component: Option,
		perOption: true,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Your options' },
			{ key: 'recommendedLabel', label: 'Recommended badge', default: 'Recommended' },
			{ key: 'footnote', label: 'Footnote', default: '', multiline: true }
		],
		images: [],
		colors: light,
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'comparison',
		title: 'Comparison',
		description: 'Every option side by side: total, duration, financing and the comparison rows.',
		Component: Comparison,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Compare your options' },
			{ key: 'subheading', label: 'Subheading', default: "Here's what each one includes." },
			{ key: 'recommendedLabel', label: 'Recommended badge', default: 'Recommended' },
			{ key: 'footnote', label: 'Footnote', default: '', multiline: true }
		],
		images: [],
		colors: light,
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'two-column',
		title: 'Image and text',
		description: 'A photo beside a heading and a paragraph.',
		Component: TwoColumn,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Heading' },
			{ key: 'body', label: 'Body', default: 'Write something helpful here.', multiline: true }
		],
		images: [{ key: 'image', label: 'Image' }],
		colors: light,
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'next-steps',
		title: 'Next steps',
		description: 'What happens next, numbered, with a contact card.',
		Component: NextSteps,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Next steps' },
			{ key: 'heading', label: 'Heading', default: "Here's what happens next" },
			{ key: 'intro', label: 'Intro', default: '', multiline: true },
			{
				key: 'steps',
				label: 'Steps (one per line, "title | detail")',
				default:
					'Choose an option | Tell us which one fits.\nConfirm the details | We finalise dates and paperwork.\nGet started | We begin on the agreed date.',
				multiline: true
			},
			{
				key: 'contact',
				label: 'Contact lines (one per line, "label | value")',
				default: 'Phone | (555) 000-0000\nEmail | hello@example.com',
				multiline: true
			},
			{ key: 'closingNote', label: 'Closing note', default: 'Questions? Reach out any time.' }
		],
		images: [{ key: 'logo', label: 'Logo' }],
		colors: light,
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'thank-you',
		title: 'Thank you',
		description: 'Closes the show with your contact details.',
		Component: ThankYou,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Thank you' },
			{ key: 'heading', label: 'Heading', default: 'Thank you' },
			{
				key: 'message',
				label: 'Message',
				default: "We're grateful for the chance to work with you.",
				multiline: true
			},
			{
				key: 'contacts',
				label: 'Contact lines (one per line, "label | value")',
				default: 'Phone | (555) 000-0000\nEmail | hello@example.com',
				multiline: true
			},
			{ key: 'ctaLabel', label: 'Button label', default: 'Book a follow-up' }
		],
		images: [
			{
				key: 'backgroundImage',
				label: 'Background image',
				description: 'Sits behind a dark scrim.'
			},
			{ key: 'logo', label: 'Logo' }
		],
		colors: dark,
		styleControls: TITLE_STYLE_CONTROLS
	}
];

/** A template by id, or null for an id no longer in the list (a slide saved under it is skipped). */
export function templateFor(id: string): SlideTemplate | null {
	return TEMPLATES.find((template) => template.id === id) ?? null;
}

/** What a slide of this template holds before the author touches it. */
export function defaultContent(template: SlideTemplate): SlideContent {
	return {
		text: Object.fromEntries(template.text.map((field) => [field.key, field.default])),
		images: Object.fromEntries(template.images.map((slot) => [slot.key, ''])),
		colors: Object.fromEntries(template.colors.map((color) => [color.key, color.default])),
		styles: {},
		variables: Object.fromEntries(
			template.text.flatMap((field) =>
				field.binding ? [[field.key, { sourceField: field.binding }]] : []
			)
		)
	};
}
