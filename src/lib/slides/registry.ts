import type { Component } from 'svelte';
import type { BindingPath } from './bindings';
import { type StyleControl, TEXT_STYLE_CONTROLS, TITLE_STYLE_CONTROLS } from './styles';
import AboutCompany from './templates/about-company.svelte';
import AftercareCloser from './templates/aftercare-closer.svelte';
import ChecklistColumns from './templates/checklist-columns.svelte';
import Comparison from './templates/comparison.svelte';
import ComparisonTable from './templates/comparison-table.svelte';
import DoctorBio from './templates/doctor-bio.svelte';
import Faq from './templates/faq.svelte';
import Guarantee from './templates/guarantee.svelte';
import HeroAngledBands from './templates/hero-angled-bands.svelte';
import HeroHexagons from './templates/hero-hexagons.svelte';
import HeroLeftText from './templates/hero-left-text.svelte';
import InvestmentSummary from './templates/investment-summary.svelte';
import MeetOurTeam from './templates/meet-our-team.svelte';
import MeetTheTeamGroups from './templates/meet-the-team-groups.svelte';
import MetricBars from './templates/metric-bars.svelte';
import NextSteps from './templates/next-steps.svelte';
import Option from './templates/option.svelte';
import OurFacilities from './templates/our-facilities.svelte';
import Portfolio from './templates/portfolio.svelte';
import PortfolioShowcase from './templates/portfolio-showcase.svelte';
import ProcessSteps from './templates/process-steps.svelte';
import ProjectHexagons from './templates/project-hexagons.svelte';
import ProviderAbout from './templates/provider-about.svelte';
import SectionDivider from './templates/section-divider.svelte';
import StatHighlights from './templates/stat-highlights.svelte';
import SubscriptionPlans from './templates/subscription-plans.svelte';
import TeamPortraits from './templates/team-portraits.svelte';
import TeamShowcase from './templates/team-showcase.svelte';
import TestimonialWall from './templates/testimonial-wall.svelte';
import ThankYouContact from './templates/thank-you-contact.svelte';
import ThreeVideo from './templates/three-video.svelte';
import TreatmentTimeline from './templates/treatment-timeline.svelte';
import TwoColImageText from './templates/two-col-image-text.svelte';
import TwoVideo from './templates/two-video.svelte';
import V1BeforeAfter from './templates/v1-before-after.svelte';
import V1Community from './templates/v1-community.svelte';
import V1CoreValues from './templates/v1-core-values.svelte';
import V1Introduction from './templates/v1-introduction.svelte';
import V1IntroductionLogo from './templates/v1-introduction-logo.svelte';
import V1OurResults from './templates/v1-our-results.svelte';
import V1Photo from './templates/v1-photo.svelte';
import V1Pricing from './templates/v1-pricing.svelte';
import V1Products from './templates/v1-products.svelte';
import V1Quote from './templates/v1-quote.svelte';
import V1Title from './templates/v1-title.svelte';
import V1VisitSummary from './templates/v1-visit-summary.svelte';
import WeAreTheBest from './templates/we-are-the-best.svelte';
import WelcomeCompany from './templates/welcome-company.svelte';
import { SLIDE_THEME } from './theme';
import type { SlideContent, SlideProps } from './types';

/**
 * The templates a slide can use — Yes Smile's library, ported as it was,
 * plus the two the proposal model needs (`option`, `comparison`). One entry
 * per template: the component that draws it and the slots the builder edits
 * — every text slot with its label, default and kind, every image slot,
 * every colour — so the editor renders any template from this list and no
 * template needs a screen of its own. A template marked `perOption` is
 * repeated once per proposal option when the deck is presented
 * (`present.ts`).
 *
 * Not ported: Yes Smile's `education`, `ai-education` and `ai-faq` slides,
 * whose content came from a dental education library and an AI pipeline
 * this template does not have, and its per-provider variants (a builder
 * feature that snapshotted a slide's text per provider) — a slot that named
 * the provider is bound to `responsible.name` instead.
 */

/** How the editor draws a text slot; a plain single-line input when unset. */
export type TextFieldKind = 'multiline' | 'toggle' | 'number';

export type TextField = {
	key: string;
	label: string;
	default: string;
	/**
	 * `multiline` is a paragraph or a list typed one item per line; `toggle`
	 * stores 'true' / 'false'; `number` stores digits. Every value is a string
	 * (the content schema), so the kind decides the control, never the value.
	 */
	kind?: TextFieldKind;
	/** Filled from the proposal at present time unless the author unbinds it. */
	binding?: BindingPath;
};

export type ImageSlot = {
	key: string;
	label: string;
	description?: string;
	/** What the slot takes; an image unless it says `video`. */
	accept?: 'video';
};

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

export const TEMPLATES: SlideTemplate[] = [
	{
		id: 'two-col-image-text',
		title: 'Two Column (Image + Text)',
		description: 'A photo beside a heading and a paragraph.',
		Component: TwoColImageText,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Heading' },
			{ key: 'body', label: 'Body', default: 'Write something helpful here.', kind: 'multiline' },
			{ key: 'invert', label: 'Image on the right', default: 'false', kind: 'toggle' }
		],
		images: [{ key: 'image', label: 'Image' }],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.surface },
			{ key: 'headingColor', label: 'Heading', default: '#0f172a' },
			{ key: 'textColor', label: 'Text', default: '#334155' },
			{ key: 'accentColor', label: 'Accent', default: '#0ea5e9' }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'v1-title',
		title: 'V1 Title',
		description:
			'The classic cover: brand, subtitle, who it is by and who it is for, over a photo.',
		Component: V1Title,
		perOption: false,
		text: [
			{ key: 'brandName', label: 'Brand name', default: 'Perfect Smile' },
			{ key: 'subtitle', label: 'Subtitle', default: 'Cityscape' },
			{ key: 'doctorName', label: 'Doctor name', default: 'Dr. Name', binding: 'responsible.name' },
			{ key: 'patientName', label: 'Patient name', default: 'Patient', binding: 'client.name' },
			{ key: 'providedByLabel', label: 'Provided by label', default: 'Provided By:' },
			{ key: 'designedForLabel', label: 'Designed for label', default: 'Designed for:' },
			{ key: 'invertLogo', label: 'Invert logo', default: 'false', kind: 'toggle' },
			{ key: 'titleBackground', label: 'Title backdrop', default: 'false', kind: 'toggle' }
		],
		images: [
			{ key: 'backgroundImage', label: 'Background Image' },
			{ key: 'logo', label: 'Logo' }
		],
		colors: [{ key: 'textColor', label: 'Text', default: SLIDE_THEME.onAccent }],
		styleControls: TITLE_STYLE_CONTROLS
	},
	{
		id: 'v1-our-results',
		title: 'V1 Our Results',
		description: 'A results photo with a heading and a quote beside it.',
		Component: V1OurResults,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Our Practice' },
			{
				key: 'quote',
				label: 'Quote',
				default:
					'Each patient brings a unique story. The warmth in their smile reflects how they share their happiness, strength, compassion, and hope. We combine artistry with clinical precision for their most expressive feature.',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'mainImage', label: 'Results Image' },
			{ key: 'logo', label: 'Decorative Logo' }
		],
		colors: [
			{ key: 'headingColor', label: 'Heading', default: '#93c5fd' },
			{ key: 'quoteColor', label: 'Quote', default: '#0f172a' }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'v1-introduction',
		title: 'V1 Introduction',
		description: 'A welcome paragraph beside an office or team photo.',
		Component: V1Introduction,
		perOption: false,
		text: [
			{
				key: 'body',
				label: 'Body',
				default:
					'Thank you for choosing us for your dental care. This detailed report captures every aspect of your visit.\n\nOur shared objective is to promote complete wellness of your oral structures with superior cosmetic appeal.',
				kind: 'multiline'
			}
		],
		images: [{ key: 'photo', label: 'Office/Team Photo' }],
		colors: [
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'textColor', label: 'Text', default: '#1f2937' }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'v1-introduction-logo',
		title: 'V1 Introduction (Logo)',
		description: 'A heading and a quote under the logo.',
		Component: V1IntroductionLogo,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Our Practice' },
			{
				key: 'quote',
				label: 'Quote',
				default:
					'Each patient brings a unique story. The warmth in their smile reflects how they share their happiness, strength, compassion, and hope. We combine artistry with clinical precision for their most expressive feature.',
				kind: 'multiline'
			}
		],
		images: [{ key: 'logo', label: 'Logo' }],
		colors: [
			{ key: 'headingColor', label: 'Heading', default: '#93c5fd' },
			{ key: 'quoteColor', label: 'Quote', default: '#0f172a' }
		],
		styleControls: []
	},
	{
		id: 'v1-visit-summary',
		title: 'V1 Visit Summary',
		description: 'The visit at a glance: who, when, with whom, and the reference.',
		Component: V1VisitSummary,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Visit Summary' },
			{ key: 'patientName', label: 'Patient name', default: 'Patient', binding: 'client.name' },
			{ key: 'visitDate', label: 'Date', default: '2026-01-01', binding: 'proposal.date' },
			{ key: 'doctorName', label: 'Doctor name', default: 'Dr. Name', binding: 'responsible.name' },
			{ key: 'visitId', label: 'Reference number', default: '12345', binding: 'proposal.id' }
		],
		images: [{ key: 'logo', label: 'Header Logo' }],
		colors: [
			{ key: 'headingColor', label: 'Heading', default: '#60a5fa' },
			{ key: 'cardBackgroundColor', label: 'Card background', default: '#f9fafb' },
			{ key: 'labelColor', label: 'Label', default: SLIDE_THEME.accent }
		],
		styleControls: []
	},
	{
		id: 'v1-quote',
		title: 'V1 Quote',
		description: 'A large quotation with a tagline and an image.',
		Component: V1Quote,
		perOption: false,
		text: [
			{
				key: 'quote',
				label: 'Quote',
				default: '"Quality Patient Care Begins with Every Appointment"',
				kind: 'multiline'
			},
			{ key: 'tagline', label: 'Tagline', default: 'Expertise | Innovation | Trust' }
		],
		images: [
			{ key: 'logo', label: 'Logo' },
			{ key: 'photo', label: 'Inspirational Image' }
		],
		colors: [
			{ key: 'quoteColor', label: 'Quote', default: '#60a5fa' },
			{ key: 'taglineColor', label: 'Tagline', default: '#1f2937' }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'v1-core-values',
		title: 'V1 Core Values',
		description: 'The principles, listed beside a feature photo.',
		Component: V1CoreValues,
		perOption: false,
		text: [
			{ key: 'brandName', label: 'Brand name', default: 'Smile Design', binding: 'org.name' },
			{ key: 'heading', label: 'Heading', default: 'Our Principles' },
			{
				key: 'values',
				label: 'Values (one per line)',
				default:
					'Clinical Excellence\nAffordable Quality\nAuthentic Results\nPatient Comfort\nScientific Inquiry\nOpen Communication\nModern Equipment\nCreative Solutions\nLocal Engagement\nReliable Outcomes',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'photo', label: 'Feature Image' },
			{ key: 'logo', label: 'Logo' }
		],
		colors: [
			{ key: 'headingColor', label: 'Heading', default: '#000000' },
			{ key: 'textColor', label: 'Text', default: '#1f2937' }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'v1-community',
		title: 'V1 Community',
		description: 'Three testimonial photos with quotes and a call to action.',
		Component: V1Community,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Become Our Patient' },
			{ key: 'buttonText', label: 'Button label', default: 'Schedule an Appointment' },
			{ key: 'buttonUrl', label: 'Button link', default: 'https://example.com' },
			{
				key: 'quote1',
				label: 'Quote 1',
				default: '"I avoided appointments for years, now I schedule visits quarterly."',
				kind: 'multiline'
			},
			{
				key: 'quote2',
				label: 'Quote 2',
				default: '"Perfect Smile has transformed my confidence."',
				kind: 'multiline'
			},
			{
				key: 'quote3',
				label: 'Quote 3',
				default: '"Outstanding service and remarkable care."',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'photo1', label: 'Testimonial 1' },
			{ key: 'photo2', label: 'Testimonial 2' },
			{ key: 'photo3', label: 'Testimonial 3' }
		],
		colors: [
			{ key: 'headingColor', label: 'Heading', default: '#000000' },
			{ key: 'buttonColor', label: 'Button', default: '#3b82f6' }
		],
		styleControls: []
	},
	{
		id: 'v1-photo',
		title: 'V1 Photo',
		description: 'One full photo with a heading and a caption.',
		Component: V1Photo,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Photos' },
			{ key: 'caption', label: 'Caption', default: '' },
			{ key: 'showLogo', label: 'Show logo', default: 'false', kind: 'toggle' }
		],
		images: [
			{ key: 'photo', label: 'Main Photo' },
			{ key: 'logo', label: 'Logo' }
		],
		colors: [{ key: 'headingColor', label: 'Heading', default: '#60a5fa' }],
		styleControls: []
	},
	{
		id: 'v1-pricing',
		title: 'V1 Pricing',
		description: 'One slide per option: its lines, the total, financing and payment links.',
		Component: V1Pricing,
		perOption: true,
		text: [
			{
				key: 'optionPrefix',
				label: 'Option prefix',
				default: 'Comprehensive Problem Focused Solution:'
			},
			{ key: 'validityText', label: 'Validity text', default: 'VALID FOR 1 MONTH' },
			{
				key: 'showDiscountStrikethrough',
				label: 'Strike through the pre-discount total',
				default: 'true',
				kind: 'toggle'
			},
			{ key: 'showFinancing', label: 'Show financing', default: 'true', kind: 'toggle' },
			{ key: 'financingLabel', label: 'Financing label', default: 'Interest-Free Financing' },
			{ key: 'financingMinimum', label: 'Financing minimum', default: '3000', kind: 'number' },
			{
				key: 'financingTerms',
				label: 'Financing terms (months, comma separated)',
				default: '12,24'
			},
			{ key: 'showCashDiscount', label: 'Show cash discount', default: 'true', kind: 'toggle' },
			{ key: 'cashDiscountLabel', label: 'Cash discount label', default: '' },
			{ key: 'cashDiscountPercent', label: 'Cash discount percent', default: '10', kind: 'number' },
			{
				key: 'paymentLinks',
				label: 'Payment links (one per line, "label | url")',
				default: '',
				kind: 'multiline'
			},
			{ key: 'showPlanners', label: 'Show planner photos', default: 'false', kind: 'toggle' },
			{ key: 'plannerLabel', label: 'Planner label', default: 'Speak to a Treatment Planner' },
			{ key: 'plannerUrl1', label: 'Planner url 1', default: '' },
			{ key: 'plannerUrl2', label: 'Planner url 2', default: '' }
		],
		images: [
			{ key: 'planner1', label: 'Planner photo 1' },
			{ key: 'planner2', label: 'Planner photo 2' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'textColor', label: 'Text', default: '#1f2937' }
		],
		styleControls: []
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
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
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
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [],
		colors: light,
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'three-video',
		title: 'Three Videos',
		description: 'Three portrait videos side by side, each with a caption and a link.',
		Component: ThreeVideo,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: '' },
			{ key: 'link1', label: 'Link 1', default: '' },
			{ key: 'link2', label: 'Link 2', default: '' },
			{ key: 'link3', label: 'Link 3', default: '' },
			{ key: 'caption1', label: 'Caption 1', default: '' },
			{ key: 'caption2', label: 'Caption 2', default: '' },
			{ key: 'caption3', label: 'Caption 3', default: '' }
		],
		images: [
			{ key: 'video1', label: 'Video 1', accept: 'video' },
			{
				key: 'video1Poster',
				label: 'Video 1 poster',
				description: 'Shown until the video plays, and in print.'
			},
			{ key: 'video2', label: 'Video 2', accept: 'video' },
			{ key: 'video2Poster', label: 'Video 2 poster' },
			{ key: 'video3', label: 'Video 3', accept: 'video' },
			{ key: 'video3Poster', label: 'Video 3 poster' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: '#000000' },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text }
		],
		styleControls: []
	},
	{
		id: 'two-video',
		title: 'Two Videos',
		description: 'Two portrait videos side by side, each with a caption and a link.',
		Component: TwoVideo,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: '' },
			{ key: 'link1', label: 'Link 1', default: '' },
			{ key: 'link2', label: 'Link 2', default: '' },
			{ key: 'caption1', label: 'Caption 1', default: '' },
			{ key: 'caption2', label: 'Caption 2', default: '' }
		],
		images: [
			{ key: 'video1', label: 'Video 1', accept: 'video' },
			{
				key: 'video1Poster',
				label: 'Video 1 poster',
				description: 'Shown until the video plays, and in print.'
			},
			{ key: 'video2', label: 'Video 2', accept: 'video' },
			{ key: 'video2Poster', label: 'Video 2 poster' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: '#000000' },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text }
		],
		styleControls: []
	},
	{
		id: 'v1-products',
		title: 'V1 Products',
		description: 'Up to four products from the catalog, badged when already on the plan.',
		Component: V1Products,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Our Products' },
			{
				key: 'skus',
				label: 'Product SKUs (one per line; blank shows the first four)',
				default: ''
			},
			{ key: 'buttonLabel', label: 'Button label', default: 'Ask us about this' },
			{ key: 'addedLabel', label: 'Added label', default: '✓ In your plan' }
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'buttonColor', label: 'Button', default: SLIDE_THEME.accent }
		],
		styleControls: []
	},
	{
		id: 'v1-before-after',
		title: 'V1 Before & After',
		description: 'Two photos side by side, labelled before and after.',
		Component: V1BeforeAfter,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Before & After' },
			{ key: 'beforeLabel', label: 'Before label', default: 'Before' },
			{ key: 'afterLabel', label: 'After label', default: 'After' },
			{ key: 'caption', label: 'Caption', default: '' },
			{ key: 'showLogo', label: 'Show logo', default: 'false', kind: 'toggle' }
		],
		images: [
			{ key: 'beforePhoto', label: 'Before Photo' },
			{ key: 'afterPhoto', label: 'After Photo' },
			{ key: 'logo', label: 'Logo' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: '#60a5fa' },
			{ key: 'labelColor', label: 'Label', default: SLIDE_THEME.onAccent },
			{ key: 'dividerColor', label: 'Divider', default: '#60a5fa' }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'provider-about',
		title: 'Provider About Me',
		description: 'The person responsible, with a photo, credentials and a bio.',
		Component: ProviderAbout,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Meet Your Provider' },
			{
				key: 'providerName',
				label: 'Provider name',
				default: 'Dr. Name',
				binding: 'responsible.name'
			},
			{
				key: 'credentials',
				label: 'Credentials (one per line)',
				default: 'DDS',
				kind: 'multiline'
			},
			{
				key: 'bio',
				label: 'Bio',
				default:
					'I believe every smile tells a story. My focus is on listening first, then combining artistry with clinical precision to help you feel confident about your care at every visit.',
				kind: 'multiline'
			},
			{ key: 'variants', label: 'Variants', default: '[]' },
			{ key: 'activeVariantId', label: 'Active variant id', default: 'default' }
		],
		images: [{ key: 'photo', label: 'Provider Photo' }],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'stat-highlights',
		title: 'Stat Highlights',
		description: 'Four big numbers with labels and icons.',
		Component: StatHighlights,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Why Patients Choose Us' },
			{ key: 'subheading', label: 'Subheading', default: '', kind: 'multiline' },
			{
				key: 'stats',
				label: 'Stats (one per line, "value | label | icon")',
				default:
					'98%|Patient Satisfaction|smile\n15,000+|Smiles Transformed|sparkles\n25+|Years of Experience|award\n4.9|Average Star Rating|star',
				kind: 'multiline'
			}
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'doctor-bio',
		title: 'Doctor Bio',
		description: 'A headshot with credentials, specialties and years of experience.',
		Component: DoctorBio,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Meet Your Doctor' },
			{ key: 'doctorName', label: 'Doctor name', default: 'Dr. Name', binding: 'responsible.name' },
			{ key: 'jobTitle', label: 'Job title', default: 'Cosmetic & Restorative Dentistry' },
			{
				key: 'bio',
				label: 'Bio',
				default:
					'With a passion for artistry and a commitment to comfort, your doctor combines advanced training with a gentle chairside manner to design smiles that look natural and last.',
				kind: 'multiline'
			},
			{
				key: 'credentials',
				label: 'Credentials (one per line)',
				default:
					'DDS, University School of Dentistry\nFellow, Academy of General Dentistry\nMember, American Dental Association\n500+ hours of continuing education',
				kind: 'multiline'
			},
			{
				key: 'badges',
				label: 'Badges (one per line)',
				default: 'Cosmetic Dentistry\nDental Implants\nFull-Mouth Restoration',
				kind: 'multiline'
			},
			{ key: 'yearsExperience', label: 'Years experience', default: '15', kind: 'number' },
			{ key: 'yearsLabel', label: 'Years label', default: 'Years of Experience' }
		],
		images: [
			{ key: 'headshot', label: 'Doctor Headshot' },
			{ key: 'logo', label: 'Practice Logo' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'meet-the-team-groups',
		title: 'Meet the Team (Groups)',
		description: 'Two or three groups of people, each with a portrait photo and names.',
		Component: MeetTheTeamGroups,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Meet the Team' },
			{ key: 'heading', label: 'Heading', default: 'The People Behind Your Smile' },
			{ key: 'group1Name', label: 'Group 1 name', default: 'Our Doctors' },
			{
				key: 'group1Members',
				label: 'Group 1 members',
				default: 'Dr. Alex Rivera\nDr. Jamie Chen',
				kind: 'multiline'
			},
			{ key: 'group2Name', label: 'Group 2 name', default: 'Hygiene Team' },
			{
				key: 'group2Members',
				label: 'Group 2 members',
				default: 'Maria Lopez, RDH\nSofia Reyes, RDH',
				kind: 'multiline'
			},
			{ key: 'group3Name', label: 'Group 3 name', default: 'Front Office' },
			{
				key: 'group3Members',
				label: 'Group 3 members',
				default: 'Emily Carter, Patient Coordinator\nGrace Kim, Treatment Coordinator',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'photo1', label: 'Group 1 Photo', description: 'Vertical (portrait) group photo' },
			{ key: 'photo2', label: 'Group 2 Photo', description: 'Vertical (portrait) group photo' },
			{
				key: 'photo3',
				label: 'Group 3 Photo',
				description:
					'Vertical (portrait) group photo — clear group 3 entirely for a two-group layout'
			}
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'faq',
		title: 'FAQ / Objections',
		description: 'Four questions with their answers, as cards.',
		Component: Faq,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Your Questions, Answered' },
			{
				key: 'subheading',
				label: 'Subheading',
				default: 'The concerns we hear most — answered honestly.',
				kind: 'multiline'
			},
			{ key: 'question1', label: 'Question 1', default: 'How much will my treatment cost?' },
			{
				key: 'answer1',
				label: 'Answer 1',
				default:
					'Every smile is different. Your exact investment is outlined on the next slide, and we offer interest-free financing to fit almost any budget.',
				kind: 'multiline'
			},
			{ key: 'question2', label: 'Question 2', default: 'Will it hurt?' },
			{
				key: 'answer2',
				label: 'Answer 2',
				default:
					'Most patients are surprised how comfortable treatment is. We use modern anesthetic techniques and sedation options so you stay relaxed the entire visit.',
				kind: 'multiline'
			},
			{ key: 'question3', label: 'Question 3', default: 'How long will it take?' },
			{
				key: 'answer3',
				label: 'Answer 3',
				default:
					"Many treatments are completed in just a few visits. We'll map out your exact timeline before we begin, so there are no surprises.",
				kind: 'multiline'
			},
			{ key: 'question4', label: 'Question 4', default: 'How long will my results last?' },
			{
				key: 'answer4',
				label: 'Answer 4',
				default:
					"With good home care and regular check-ups, your results can last for decades — and they're backed by our guarantee.",
				kind: 'multiline'
			}
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'cardBackgroundColor', label: 'Card background', default: SLIDE_THEME.surface },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'guarantee',
		title: 'Guarantee',
		description: 'The promise in writing, with terms and a seal.',
		Component: Guarantee,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Our Promise to You' },
			{ key: 'heading', label: 'Heading', default: 'The Guaranteeth Guarantee' },
			{
				key: 'subheading',
				label: 'Subheading',
				default:
					"We stand behind every smile we create. If your treatment doesn't hold up, we make it right — that's not marketing, it's in writing.",
				kind: 'multiline'
			},
			{
				key: 'terms',
				label: 'Terms (one per line, "title | body")',
				default:
					'Free repair or replacement|If your restoration chips, cracks, or fails within the guarantee period, we fix it at no cost to you.\nLifetime workmanship promise|Our lab work and craftsmanship are covered for as long as you remain a patient of record.\nKeep your check-ups, keep your coverage|Simply maintain your regular hygiene visits with us to keep your guarantee active.',
				kind: 'multiline'
			},
			{
				key: 'finePrint',
				label: 'Fine print',
				default:
					'Guarantee applies to treatment completed at our practice and requires attendance at recommended hygiene appointments. Full terms provided with your treatment plan.',
				kind: 'multiline'
			},
			{ key: 'sealTopText', label: 'Seal top text', default: 'GUARANTEED' },
			{ key: 'sealBottomText', label: 'Seal bottom text', default: 'GUARANTEETH' }
		],
		images: [{ key: 'logo', label: 'Practice Logo' }],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'sealColor', label: 'Seal', default: SLIDE_THEME.heading }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'aftercare-closer',
		title: 'Aftercare & Next Steps',
		description: 'What to keep in mind afterwards, with a QR code to book the next visit.',
		Component: AftercareCloser,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: "You're in Good Hands" },
			{
				key: 'message',
				label: 'Message',
				default:
					'Caring for your smile continues at home. Here is what to keep in mind after each procedure — and we are always one call away.',
				kind: 'multiline'
			},
			{ key: 'scheduleUrl', label: 'Schedule url', default: '' },
			{
				key: 'scheduleLabel',
				label: 'Schedule label',
				default: 'Scan to schedule your next visit'
			},
			{
				key: 'items',
				label: 'Aftercare items (one per line, "title | note")',
				default:
					'Dental Crown | Mild sensitivity is normal for a few days — brush and floss normally and avoid very sticky foods at first.\nDeep Cleaning | Gums may feel tender for a day or two; rinse with warm salt water and keep up gentle brushing.',
				kind: 'multiline'
			}
		],
		images: [],
		colors: [
			{ key: 'primaryColor', label: 'Primary', default: SLIDE_THEME.heading },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: []
	},
	{
		id: 'welcome-company',
		title: 'Welcome (Company Intro)',
		description: 'A welcome heading and paragraph beside a feature image.',
		Component: WelcomeCompany,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Welcome to our practice' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Welcome to our dental practice, where your comfort always comes first. Our experienced team provides gentle, comprehensive care — from routine cleanings and exams to cosmetic and restorative treatments — using the latest technology to make every visit easy and keep every smile healthy and bright.',
				kind: 'multiline'
			}
		],
		images: [{ key: 'image', label: 'Feature Image' }],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'hero-left-text',
		title: 'Hero (Text + Background)',
		description: 'A hero: eyebrow, title, paragraph and a button over a background photo.',
		Component: HeroLeftText,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Medical Healthcare Presentation Template' },
			{ key: 'title', label: 'Title', default: 'Mediflow' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
				kind: 'multiline'
			},
			{ key: 'buttonText', label: 'Button label', default: 'Start Now' },
			{ key: 'year', label: 'Year', default: '' }
		],
		images: [
			{ key: 'backgroundImage', label: 'Background Image' },
			{ key: 'logo', label: 'Logo (optional)' }
		],
		colors: [
			{ key: 'eyebrowColor', label: 'Eyebrow', default: SLIDE_THEME.accent },
			{ key: 'titleColor', label: 'Title', default: SLIDE_THEME.heading },
			{ key: 'bodyColor', label: 'Body', default: SLIDE_THEME.text },
			{ key: 'buttonColorStart', label: 'Button color start', default: SLIDE_THEME.accent },
			{ key: 'buttonColorEnd', label: 'Button color end', default: SLIDE_THEME.heading },
			{ key: 'overlayColor', label: 'Overlay', default: SLIDE_THEME.onAccent }
		],
		styleControls: TITLE_STYLE_CONTROLS
	},
	{
		id: 'about-company',
		title: 'About (Company + Highlights)',
		description: 'About the company, with two highlight cards and a photo.',
		Component: AboutCompany,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'About\nour practice', kind: 'multiline' },
			{
				key: 'body',
				label: 'Body',
				default:
					'For over two decades, our practice has helped families smile with confidence. We blend modern dentistry with a warm, patient-first approach — offering everything from preventive hygiene to implants and full-mouth restorations, all under one comfortable roof.',
				kind: 'multiline'
			},
			{ key: 'card1Title', label: 'Card 1 title', default: 'Gentle Care' },
			{
				key: 'card1Body',
				label: 'Card 1 body',
				default:
					'Sedation options and a calming environment keep even anxious patients relaxed through every appointment.',
				kind: 'multiline'
			},
			{ key: 'card2Title', label: 'Card 2 title', default: 'Modern Technology' },
			{
				key: 'card2Body',
				label: 'Card 2 body',
				default:
					'Digital scanners and same-day crowns mean faster, more comfortable visits with precise, lasting results.',
				kind: 'multiline'
			}
		],
		images: [{ key: 'image', label: 'Feature Photo' }],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'hero-angled-bands',
		title: 'Hero (Angled Bands)',
		description: 'A photo under angled colour bands with a big title.',
		Component: HeroAngledBands,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Welcome To' },
			{ key: 'title', label: 'Title', default: 'The Clinic' }
		],
		images: [{ key: 'backgroundImage', label: 'Clinic Photo' }],
		colors: [
			{ key: 'bandColor', label: 'Band', default: SLIDE_THEME.heading },
			{ key: 'bandColorDeep', label: 'Band color deep', default: SLIDE_THEME.navy },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.onAccent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'our-facilities',
		title: 'Our Facilities (Two Photos + Cards)',
		description: 'Two photos and two cards describing the facilities.',
		Component: OurFacilities,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Our facilities' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Step into a bright, modern office designed around your comfort. Our treatment rooms feature the latest digital imaging, sterilization, and chairside technology so you receive safe, precise, and efficient dental care at every visit.',
				kind: 'multiline'
			},
			{ key: 'card1Title', label: 'Card 1 title', default: 'Digital Imaging' },
			{
				key: 'card1Body',
				label: 'Card 1 body',
				default:
					'Low-radiation 3D scans give us a clear view for accurate diagnosis and treatment planning.',
				kind: 'multiline'
			},
			{ key: 'card2Title', label: 'Card 2 title', default: 'Sterile & Safe' },
			{
				key: 'card2Body',
				label: 'Card 2 body',
				default:
					'Hospital-grade sterilization and strict protocols protect every patient at every appointment.',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'imageLarge', label: 'Large Photo' },
			{ key: 'imageSmall', label: 'Small Photo' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'team-showcase',
		title: 'Team Showcase',
		description: 'Two team members with photos, bios and buttons.',
		Component: TeamShowcase,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Our Team' },
			{ key: 'heading', label: 'Heading', default: 'Mediflow Expert' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliquam ad minim veniam quis nostrud exercitation.',
				kind: 'multiline'
			},
			{ key: 'buttonText', label: 'Button label', default: 'Read More' },
			{ key: 'member1Name', label: 'Member 1 name', default: 'Keith Wood' },
			{
				key: 'member1Bio',
				label: 'Member 1 bio',
				default: 'Lorem ipsum dolor sit amet, consectetur adipiscing'
			},
			{ key: 'member1Button', label: 'Member 1 button', default: 'More Info' },
			{ key: 'member2Name', label: 'Member 2 name', default: 'Noel Shelton' },
			{
				key: 'member2Bio',
				label: 'Member 2 bio',
				default: 'Lorem ipsum dolor sit amet, consectetur adipiscing'
			},
			{ key: 'member2Button', label: 'Member 2 button', default: 'More Info' }
		],
		images: [
			{ key: 'photo1', label: 'Member 1 Photo' },
			{ key: 'photo2', label: 'Member 2 Photo' }
		],
		colors: [
			{ key: 'eyebrowColor', label: 'Eyebrow', default: SLIDE_THEME.accent },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'bodyColor', label: 'Body', default: SLIDE_THEME.text },
			{ key: 'nameColor', label: 'Name', default: SLIDE_THEME.accent },
			{ key: 'buttonColorStart', label: 'Button color start', default: SLIDE_THEME.accent },
			{ key: 'buttonColorEnd', label: 'Button color end', default: SLIDE_THEME.heading },
			{ key: 'circleColor', label: 'Circle', default: '#eef1f4' },
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'portfolio-showcase',
		title: 'Portfolio Showcase',
		description: 'Two portfolio photos with two described items.',
		Component: PortfolioShowcase,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Our Portfolio' },
			{ key: 'titleLine1', label: 'Title line 1', default: 'Mediflow' },
			{ key: 'titleLine2', label: 'Title line 2', default: 'Our Portfolio' },
			{ key: 'cardLabel', label: 'Card label', default: 'Best Portfolio' },
			{ key: 'item1Heading', label: 'Item 1 heading', default: 'Portfolio One' },
			{
				key: 'item1Body',
				label: 'Item 1 body',
				default:
					'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod consectetur adit consectetur adipiscing.',
				kind: 'multiline'
			},
			{ key: 'item2Heading', label: 'Item 2 heading', default: 'Portfolio Two' },
			{
				key: 'item2Body',
				label: 'Item 2 body',
				default:
					'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod consectetur adit consectetur adipiscing.',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'image1', label: 'Tall Photo (left)' },
			{ key: 'image2', label: 'Second Photo (bottom)' }
		],
		colors: [
			{ key: 'eyebrowColor', label: 'Eyebrow', default: SLIDE_THEME.accent },
			{ key: 'titleColor', label: 'Title', default: SLIDE_THEME.heading },
			{ key: 'itemHeadingColor', label: 'Item heading', default: SLIDE_THEME.accent },
			{ key: 'bodyColor', label: 'Body', default: SLIDE_THEME.text },
			{ key: 'cardColorStart', label: 'Card color start', default: SLIDE_THEME.accent },
			{ key: 'cardColorEnd', label: 'Card color end', default: SLIDE_THEME.heading },
			{ key: 'circleColor', label: 'Circle', default: '#e2e8f0' },
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'team-portraits',
		title: 'Team (Portraits + Badge)',
		description: 'Two portraits with a badge between them.',
		Component: TeamPortraits,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Our Team' },
			{ key: 'titleLine1', label: 'Title line 1', default: 'Best Doctor' },
			{ key: 'titleLine2', label: 'Title line 2', default: 'Specialist' },
			{ key: 'member1Name', label: 'Member 1 name', default: 'Owen Reyes' },
			{
				key: 'member1Bio',
				label: 'Member 1 bio',
				default:
					'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod consectetur adit consectetur adipiscing.'
			},
			{ key: 'member2Name', label: 'Member 2 name', default: 'Cesar Coleman' },
			{
				key: 'member2Bio',
				label: 'Member 2 bio',
				default:
					'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod consectetur adit consectetur adipiscing.'
			}
		],
		images: [
			{ key: 'photo1', label: 'Left Portrait' },
			{ key: 'photo2', label: 'Right Portrait' },
			{
				key: 'logo',
				label: 'Center Logo (optional)',
				description: 'Replaces the cross badge when set.'
			}
		],
		colors: [
			{ key: 'eyebrowColor', label: 'Eyebrow', default: SLIDE_THEME.accent },
			{ key: 'titleColor', label: 'Title', default: SLIDE_THEME.heading },
			{ key: 'nameColor', label: 'Name', default: SLIDE_THEME.accent },
			{ key: 'bodyColor', label: 'Body', default: SLIDE_THEME.text },
			{ key: 'crossColorStart', label: 'Cross color start', default: SLIDE_THEME.accent },
			{ key: 'crossColorEnd', label: 'Cross color end', default: SLIDE_THEME.heading },
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'hero-hexagons',
		title: 'Hero (Hexagons)',
		description: 'A honeycomb of photos and colour beside a title.',
		Component: HeroHexagons,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Innovation In Care' },
			{ key: 'titleLine1', label: 'Title line 1', default: 'Medical Technology' },
			{ key: 'titleLine2', label: 'Title line 2', default: 'Breakthroughs' },
			{ key: 'body', label: 'Body', default: '', kind: 'multiline' },
			{ key: 'buttonText', label: 'Button label', default: '' }
		],
		images: [
			{ key: 'image1', label: 'Main Hexagon Photo' },
			{ key: 'image2', label: 'Secondary Hexagon Photo' }
		],
		colors: [
			{ key: 'eyebrowColor', label: 'Eyebrow', default: SLIDE_THEME.accent },
			{ key: 'titleColor', label: 'Title', default: SLIDE_THEME.heading },
			{ key: 'bodyColor', label: 'Body', default: SLIDE_THEME.text },
			{ key: 'hexColorDeep', label: 'Hex color deep', default: SLIDE_THEME.heading },
			{ key: 'hexColorBright', label: 'Hex color bright', default: '#60a5fa' },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'we-are-the-best',
		title: 'We Are The Best (Steps + Two Photos)',
		description: 'Three numbered reasons beside two photos.',
		Component: WeAreTheBest,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'We are the\nbest', kind: 'multiline' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Patients choose us for compassionate, high-quality dentistry, a team that truly listens, and a commitment to comfortable care with lasting results.',
				kind: 'multiline'
			},
			{ key: 'step1Title', label: 'Step 1 title', default: 'Experienced Team' },
			{
				key: 'step1Body',
				label: 'Step 1 body',
				default:
					'Skilled dentists and hygienists with years of advanced training and continuing education.',
				kind: 'multiline'
			},
			{ key: 'step2Title', label: 'Step 2 title', default: 'Comfort First' },
			{
				key: 'step2Body',
				label: 'Step 2 body',
				default: 'Gentle techniques and sedation options for a relaxed, pain-free experience.',
				kind: 'multiline'
			},
			{ key: 'step3Title', label: 'Step 3 title', default: 'Lasting Results' },
			{
				key: 'step3Body',
				label: 'Step 3 body',
				default: 'Durable, natural-looking treatments backed by our satisfaction guarantee.',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'imageLeft', label: 'Left Photo' },
			{ key: 'imageRight', label: 'Right Photo' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent },
			{ key: 'numberColor', label: 'Number', default: SLIDE_THEME.heading }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'meet-our-team',
		title: 'Meet Our Team (Four Members)',
		description: 'Four team members with photos, names and roles.',
		Component: MeetOurTeam,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Meet our team' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Get to know the caring dentists, hygienists, and staff dedicated to keeping your smile healthy. Our friendly team is here to make every visit comfortable and stress-free.',
				kind: 'multiline'
			},
			{ key: 'name1', label: 'Name 1', default: 'Dr. Theressa Jakson' },
			{ key: 'role1', label: 'Role 1', default: 'Lead Dentist' },
			{ key: 'name2', label: 'Name 2', default: 'Dr. John Doe' },
			{ key: 'role2', label: 'Role 2', default: 'Cosmetic Dentist' },
			{ key: 'name3', label: 'Name 3', default: 'William Cochran' },
			{ key: 'role3', label: 'Role 3', default: 'Dental Hygienist' },
			{ key: 'name4', label: 'Name 4', default: 'Malse Jelsr' },
			{ key: 'role4', label: 'Role 4', default: 'Treatment Coordinator' }
		],
		images: [
			{ key: 'image1', label: 'Member 1 Photo' },
			{ key: 'image2', label: 'Member 2 Photo' },
			{ key: 'image3', label: 'Member 3 Photo' },
			{ key: 'image4', label: 'Member 4 Photo' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'portfolio',
		title: 'Portfolio (Photo Cluster)',
		description: 'A cluster of four photos beside a paragraph.',
		Component: Portfolio,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Portfolio' },
			{
				key: 'body',
				label: 'Body',
				default:
					"Explore a selection of the smiles we've transformed. From cosmetic veneers and professional whitening to dental implants and full-mouth rehabilitation, our portfolio reflects our commitment to natural-looking, lasting results for every patient we treat.",
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'image1', label: 'Photo 1' },
			{ key: 'image2', label: 'Photo 2' },
			{ key: 'image3', label: 'Photo 3' },
			{ key: 'image4', label: 'Photo 4' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'project-hexagons',
		title: 'Project (Hexagons)',
		description: 'Three photos in hexagons beside a title and a banner.',
		Component: ProjectHexagons,
		perOption: false,
		text: [
			{ key: 'title', label: 'Title', default: 'Your Project' },
			{
				key: 'body',
				label: 'Body',
				default:
					'Presentations are communication tools that can be used as demonstrations, lectures, speeches, reports, and more. It is mostly presented before an audience. It serves a variety of purposes, making presentations powerful tools for convincing and teaching.',
				kind: 'multiline'
			},
			{ key: 'metaLine1', label: 'Meta line 1', default: 'Year: 2022' },
			{ key: 'metaLine2', label: 'Meta line 2', default: 'Role: Write Your Role' }
		],
		images: [
			{ key: 'image1', label: 'Top Hexagon Photo' },
			{ key: 'image2', label: 'Lower-Left Hexagon Photo' },
			{ key: 'image3', label: 'Right Hexagon Photo' }
		],
		colors: [
			{ key: 'titleColor', label: 'Title', default: SLIDE_THEME.heading },
			{ key: 'bannerColor', label: 'Banner', default: SLIDE_THEME.accent },
			{ key: 'bodyColor', label: 'Body', default: SLIDE_THEME.onAccent },
			{ key: 'metaColor', label: 'Meta', default: SLIDE_THEME.accent },
			{ key: 'hexAccentColor', label: 'Hex accent', default: SLIDE_THEME.accent },
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'subscription-plans',
		title: 'Membership Plans (Cards)',
		description: 'Up to four membership plans as cards, one featured.',
		Component: SubscriptionPlans,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Membership Savings Plans' },
			{
				key: 'subheading',
				label: 'Subheading',
				default: 'No insurance? No problem. Pick the plan that fits and start saving today.',
				kind: 'multiline'
			},
			{
				key: 'plans',
				label:
					'Plans (one per line, "name | eligibility | monthly | yearly | savings | benefit; benefit")',
				default:
					'Adult|ages 14+|55|660|411|2 Cleanings; 2 Fluoride applications; 2 Routine exams; Annual x-rays; 1 Emergency visit\nSenior|ages 55+|53|636|435|2 Cleanings; 2 Fluoride applications; 2 Routine exams; Annual x-rays; 1 Emergency visit\nChild|ages 13 & under|46|552|372|2 Cleanings; 2 Fluoride applications; 2 Routine exams; Annual x-rays; 1 Emergency visit\nPerio|adults|107|1284|485|4 Periodontal maintenance cleanings; 4 Fluoride applications; 2 Routine exams; Annual x-rays; 1 Emergency visit',
				kind: 'multiline'
			},
			{
				key: 'featuredPlan',
				label: 'Featured plan (1-based; 0 for none)',
				default: '1',
				kind: 'number'
			},
			{ key: 'featuredLabel', label: 'Featured label', default: 'Most Popular' },
			{
				key: 'footnote',
				label: 'Footnote',
				default:
					'Membership is not insurance. $150 one-time enrollment fee for new patients; $100 for existing patients. Enrollment fees waived for members who pay annually.',
				kind: 'multiline'
			}
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'treatment-timeline',
		title: 'Treatment Timeline',
		description: 'The steps on a rail, with the current one marked.',
		Component: TreatmentTimeline,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Your Treatment Timeline' },
			{
				key: 'subheading',
				label: 'Subheading',
				default: 'Every visit is planned in advance, so you always know what comes next.',
				kind: 'multiline'
			},
			{
				key: 'steps',
				label: 'Steps (one per line, "title | detail")',
				default:
					'Consultation|Exam, digital scans & photos\nTreatment Plan|We review options and costs together\nActive Treatment|The work itself, in comfortable visits\nFinal Reveal|Fit, polish and your new smile\nOngoing Care|Check-ups that protect your investment',
				kind: 'multiline'
			},
			{
				key: 'currentStep',
				label: 'Current step (1-based; 0 for none)',
				default: '2',
				kind: 'number'
			},
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'investment-summary',
		title: 'Investment Summary (Auto-Totals)',
		description: 'Typed line items totalled, with discount, insurance and a monthly payment.',
		Component: InvestmentSummary,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Your Investment' },
			{
				key: 'patientName',
				label: 'Patient name',
				default: 'Patient Name',
				binding: 'client.name'
			},
			{
				key: 'lineItems',
				label: 'Line items (one per line, "label | amount")',
				default:
					'Comprehensive Exam & Imaging|$350\nDeep Cleaning (Two Quadrants)|$1,200\nPorcelain Crown — Tooth #14|$1,850\nWhitening & Finishing|$600',
				kind: 'multiline'
			},
			{ key: 'discountPercent', label: 'Discount percent', default: '10', kind: 'number' },
			{ key: 'discountLabel', label: 'Discount label', default: 'Practice Courtesy' },
			{ key: 'insuranceEstimate', label: 'Insurance estimate', default: '1000', kind: 'number' },
			{ key: 'insuranceLabel', label: 'Insurance label', default: 'Estimated Insurance' },
			{ key: 'financingMonths', label: 'Financing months', default: '24', kind: 'number' },
			{ key: 'financingApr', label: 'Financing apr', default: '0', kind: 'number' },
			{ key: 'totalLabel', label: 'Total label', default: 'Your Investment' },
			{
				key: 'footnote',
				label: 'Footnote',
				default:
					"Insurance figures are an estimate based on your plan's reported benefits, not a guarantee of payment.",
				kind: 'multiline'
			}
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'metric-bars',
		title: 'Metric Bars (Auto-Scaled)',
		description: 'Labelled bars scaled against a maximum.',
		Component: MetricBars,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'By the Numbers' },
			{
				key: 'subheading',
				label: 'Subheading',
				default: 'A snapshot of how our patients rate their care over the last twelve months.',
				kind: 'multiline'
			},
			{
				key: 'rows',
				label: 'Rows (one per line, "label | value | max | suffix")',
				default:
					'Patient Satisfaction|98|100|%\nCases Completed On Schedule|91|100|%\nNew Patients From Referrals|74|100|%\nSeen Same Day For Emergencies|62|100|%',
				kind: 'multiline'
			},
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'comparison-table',
		title: 'Comparison Table',
		description: 'A typed table of options, one column recommended.',
		Component: ComparisonTable,
		perOption: false,
		text: [
			{ key: 'heading', label: 'Heading', default: 'Compare Your Options' },
			{
				key: 'subheading',
				label: 'Subheading',
				default: "Three ways to get there — here's what each one includes.",
				kind: 'multiline'
			},
			{
				key: 'table',
				label: 'Table (one row per line, cells split by "|"; a header ending in * is recommended)',
				default:
					'|Essential|Complete*|Premium\nTreatment Time|6–9 months|4–6 months|3–4 months\nLab-Crafted Porcelain|no|yes|yes\nWhitening Included|no|yes|yes\nNight Guard|no|no|yes\nWarranty|2 years|5 years|Lifetime',
				kind: 'multiline'
			},
			{ key: 'recommendedLabel', label: 'Recommended label', default: 'Recommended' },
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'next-steps',
		title: 'Next Steps (Personalized)',
		description: 'What happens next, numbered, with a contact card.',
		Component: NextSteps,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Next Steps' },
			{ key: 'heading', label: 'Heading', default: "here's what happens next" },
			{
				key: 'patientName',
				label: 'Patient name',
				default: 'Patient Name',
				binding: 'client.name'
			},
			{ key: 'doctorName', label: 'Doctor name', default: 'Dr. Name', binding: 'responsible.name' },
			{ key: 'visitDate', label: 'Date', default: 'Today', binding: 'proposal.date' },
			{
				key: 'intro',
				label: 'Intro',
				default:
					"Nothing here needs to happen today — take the plan home, and we'll be ready when you are.",
				kind: 'multiline'
			},
			{
				key: 'steps',
				label: 'Steps (one per line, "title | detail")',
				default:
					"Review your plan|Everything we discussed is in the summary you're taking home.\nConfirm your benefits|We'll verify coverage and send you the final estimate.\nReserve your appointment|Pick the date that works and we'll hold the time.\nStart treatment|Arrive 10 minutes early for your first visit.",
				kind: 'multiline'
			},
			{
				key: 'contact',
				label: 'Contact lines (one per line, "label | value")',
				default:
					'Call or Text|(555) 123-4567\nEmail|hello@yourpractice.com\nOffice Hours|Mon–Thu, 8am–5pm',
				kind: 'multiline'
			},
			{
				key: 'closingNote',
				label: 'Closing note',
				default: 'Questions between now and then? Just reply to our text thread.'
			}
		],
		images: [{ key: 'logo', label: 'Practice Logo' }],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'section-divider',
		title: 'Section Divider',
		description: 'A numbered chapter break with an optional side photo.',
		Component: SectionDivider,
		perOption: false,
		text: [
			{ key: 'sectionNumber', label: 'Section number', default: '01' },
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Section' },
			{ key: 'heading', label: 'Heading', default: 'Your Treatment Plan' },
			{
				key: 'subheading',
				label: 'Subheading',
				default: 'What we found, what we recommend, and what it costs.',
				kind: 'multiline'
			}
		],
		images: [
			{ key: 'image', label: 'Side Photo', description: 'Optional — fills the angled right panel.' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.heading },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.onAccent },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.onDarkMuted },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TITLE_STYLE_CONTROLS
	},
	{
		id: 'process-steps',
		title: 'Process Steps',
		description: 'Three or four steps across the slide.',
		Component: ProcessSteps,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Simple & Predictable' },
			{ key: 'heading', label: 'Heading', default: 'How It Works' },
			{ key: 'subheading', label: 'Subheading', default: '', kind: 'multiline' },
			{
				key: 'steps',
				label: 'Steps (one per line, "title | detail")',
				default:
					'Consult|A full exam, digital imaging, and an honest conversation about your goals.\nPlan|A written plan with every option, timeline, and cost laid out clearly.\nTreat|Comfortable visits scheduled around your life, with no surprises.\nMaintain|Follow-up care that protects the result for years to come.',
				kind: 'multiline'
			},
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'testimonial-wall',
		title: 'Testimonial Wall (Star Ratings)',
		description: 'Three reviews with star ratings and photos.',
		Component: TestimonialWall,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Real Patients' },
			{ key: 'heading', label: 'Heading', default: 'What Our Patients Say' },
			{
				key: 'reviews',
				label: 'Reviews (one per line, "quote | name | detail | rating")',
				default:
					'I put this off for years because I was nervous. They walked me through every step and it was genuinely painless.|Sarah M.|Full-Mouth Restoration|5\nThe treatment plan was in plain English, with the price on the page. No surprises at checkout.|James T.|Implant & Crown|5\nMy kids actually ask when the next visit is. That still surprises me.|Priya R.|Family Patient, 6 years|4.5',
				kind: 'multiline'
			},
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [
			{ key: 'avatar1', label: 'Photo — Review 1' },
			{ key: 'avatar2', label: 'Photo — Review 2' },
			{ key: 'avatar3', label: 'Photo — Review 3' }
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.surface },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'checklist-columns',
		title: 'Checklist (Auto Columns)',
		description: 'A checklist that balances itself into columns.',
		Component: ChecklistColumns,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: 'Included With Your Care' },
			{ key: 'heading', label: 'Heading', default: "What's Included" },
			{ key: 'subheading', label: 'Subheading', default: '', kind: 'multiline' },
			{
				key: 'items',
				label: 'Items (one per line)',
				default:
					'Comprehensive exam and digital X-rays\nIntraoral photos and smile design preview\nWritten treatment plan with itemized pricing\nInsurance verification before you commit\nFlexible payment and financing options\nSame-day emergency access\nPost-treatment check-in call\nWorkmanship warranty on completed work',
				kind: 'multiline'
			},
			{ key: 'footnote', label: 'Footnote', default: '', kind: 'multiline' }
		],
		images: [
			{
				key: 'image',
				label: 'Side Photo',
				description: 'Optional — adding a photo collapses the list to one column.'
			}
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.background },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.heading },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.text },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
		styleControls: TEXT_STYLE_CONTROLS
	},
	{
		id: 'thank-you-contact',
		title: 'Thank You / Contact',
		description: 'Closes the show with your contact details.',
		Component: ThankYouContact,
		perOption: false,
		text: [
			{ key: 'eyebrow', label: 'Eyebrow', default: "We're Glad You're Here" },
			{ key: 'heading', label: 'Heading', default: 'Thank You' },
			{
				key: 'message',
				label: 'Message',
				default:
					"Take your time with the plan. When you're ready, we're one call, text, or click away.",
				kind: 'multiline'
			},
			{
				key: 'contacts',
				label: 'Contact lines (one per line, "label | value | icon")',
				default:
					'Call or Text|(555) 123-4567|phone\nEmail|hello@yourpractice.com|mail\nVisit|yourpractice.com|globe\nFind Us|123 Main St, Suite 200|pin',
				kind: 'multiline'
			},
			{ key: 'ctaLabel', label: 'Button label', default: 'Schedule Your Next Visit' }
		],
		images: [
			{ key: 'logo', label: 'Practice Logo' },
			{
				key: 'backgroundImage',
				label: 'Background Image',
				description: 'Optional — sits behind a dark scrim.'
			}
		],
		colors: [
			{ key: 'backgroundColor', label: 'Background', default: SLIDE_THEME.heading },
			{ key: 'headingColor', label: 'Heading', default: SLIDE_THEME.onAccent },
			{ key: 'textColor', label: 'Text', default: SLIDE_THEME.onDarkMuted },
			{ key: 'accentColor', label: 'Accent', default: SLIDE_THEME.accent }
		],
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
