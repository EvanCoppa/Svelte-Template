/**
 * Typography & layout overrides for a slide — the "Typography & Layout"
 * section of the builder. Values live in `content.styles` as strings and
 * reach a template as CSS custom properties with built-in fallbacks
 * (`calc(84px * var(--font-scale, 1))`), so a slide with no styles renders
 * exactly as the template designed it.
 */

export type StyleControlType = 'scale' | 'choice';

export type StyleControl = {
	key: string;
	label: string;
	type: StyleControlType;
	/** `scale` controls: the slider's range and where it rests when unset. */
	min?: number;
	max?: number;
	step?: number;
	default?: number;
	/** How a `scale` value reads next to the slider: "120%", "1.4x". */
	format?: (value: number) => string;
	/** `choice` controls: the segmented options. */
	options?: { value: string; label: string }[];
	hint?: string;
};

const percent = (value: number) => `${String(Math.round(value * 100))}%`;

export const STYLE_CONTROLS = {
	fontScale: {
		key: 'fontScale',
		label: 'Text size',
		type: 'scale',
		min: 0.7,
		max: 1.5,
		step: 0.05,
		default: 1,
		format: percent,
		hint: 'Scales every text element on the slide.'
	},
	fontWeight: {
		key: 'fontWeight',
		label: 'Font weight',
		type: 'choice',
		options: [
			{ value: '300', label: 'Light' },
			{ value: '400', label: 'Normal' },
			{ value: '600', label: 'Semibold' },
			{ value: '700', label: 'Bold' }
		]
	},
	lineHeight: {
		key: 'lineHeight',
		label: 'Line spacing',
		type: 'scale',
		min: 0.9,
		max: 2,
		step: 0.05,
		default: 1.4,
		format: (value) => `${value.toFixed(2)}x`,
		hint: 'Vertical spacing between lines of body text.'
	},
	letterSpacing: {
		key: 'letterSpacing',
		label: 'Letter spacing',
		type: 'scale',
		min: -0.04,
		max: 0.2,
		step: 0.01,
		default: 0,
		format: (value) => `${value.toFixed(2)}em`
	},
	textAlign: {
		key: 'textAlign',
		label: 'Text alignment',
		type: 'choice',
		options: [
			{ value: 'left', label: 'Left' },
			{ value: 'center', label: 'Center' },
			{ value: 'right', label: 'Right' }
		]
	},
	verticalAlign: {
		key: 'verticalAlign',
		label: 'Vertical position',
		type: 'choice',
		options: [
			{ value: 'top', label: 'Top' },
			{ value: 'center', label: 'Middle' },
			{ value: 'bottom', label: 'Bottom' }
		]
	},
	padding: {
		key: 'padding',
		label: 'Spacing density',
		type: 'choice',
		options: [
			{ value: 'compact', label: 'Compact' },
			{ value: 'normal', label: 'Normal' },
			{ value: 'roomy', label: 'Roomy' }
		]
	}
} as const satisfies Record<string, StyleControl>;

/** What most templates expose: body text controls, no layout ones. */
export const TEXT_STYLE_CONTROLS: StyleControl[] = [
	STYLE_CONTROLS.fontScale,
	STYLE_CONTROLS.fontWeight,
	STYLE_CONTROLS.lineHeight,
	STYLE_CONTROLS.letterSpacing
];

/** Title-style templates can also move their block up and down. */
export const TITLE_STYLE_CONTROLS: StyleControl[] = [
	...TEXT_STYLE_CONTROLS,
	STYLE_CONTROLS.verticalAlign,
	STYLE_CONTROLS.padding
];

const FONT_WEIGHTS = new Set(['100', '200', '300', '400', '500', '600', '700', '800', '900']);
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const JUSTIFY = new Map([
	['top', 'flex-start'],
	['center', 'center'],
	['bottom', 'flex-end']
]);
const PADDING_SCALE = new Map([
	['compact', '0.7'],
	['normal', '1'],
	['roomy', '1.3']
]);

function positive(raw: string | undefined): number | null {
	const value = Number(raw);
	return raw !== undefined && raw !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The inline `style` a template puts on its root: one custom property per
 * set, valid value. Values are whitelisted or parsed as numbers — a deck is
 * data the browser sends, and this string lands inside a style attribute.
 */
export function slideStyleVars(styles: Record<string, string>): string {
	const vars: string[] = [];
	const fontScale = positive(styles.fontScale);
	if (fontScale !== null) vars.push(`--font-scale:${String(fontScale)}`);
	if (FONT_WEIGHTS.has(styles.fontWeight)) vars.push(`--font-weight:${styles.fontWeight}`);
	const lineHeight = positive(styles.lineHeight);
	if (lineHeight !== null) vars.push(`--line-height:${String(lineHeight)}`);
	const letterSpacing = Number(styles.letterSpacing);
	if (styles.letterSpacing !== '' && Number.isFinite(letterSpacing) && styles.letterSpacing) {
		vars.push(`--letter-spacing:${String(letterSpacing)}em`);
	}
	if (TEXT_ALIGNS.has(styles.textAlign)) vars.push(`--text-align:${styles.textAlign}`);
	const justify = JUSTIFY.get(styles.verticalAlign);
	if (justify) vars.push(`--content-justify:${justify}`);
	const padding = PADDING_SCALE.get(styles.padding);
	if (padding) vars.push(`--padding-scale:${padding}`);
	return vars.join(';');
}
