/**
 * The standard slide palette. A slide is a fixed 1400×850 canvas whose
 * colours the author chooses and which prints as authored, so — unlike every
 * screen in the app — it does not paint from the theme's tokens or follow
 * the light/dark toggle: these are literals written straight into inline
 * `style` attributes. Every template's default colours come from here, so a
 * freshly added slide lands on the house look whatever its template.
 */
export const SLIDE_THEME = {
	/** Slide canvas. */
	background: '#ffffff',
	/** Headings and titles. */
	heading: '#1e3a5f',
	/** Body copy. */
	text: '#374151',
	/** Accent: eyebrows, rules, buttons, decorative fills. */
	accent: '#2563eb',
	/** The accent's lighter end, for the far side of accent gradients. */
	accentBright: '#60a5fa',
	/** Deepest ink, for the far end of dark gradients. */
	navy: '#0b1a2b',
	/** Soft neutral surface for cards sitting on the background. */
	surface: '#f8fafc',
	/** Text placed on top of an accent or photo fill. */
	onAccent: '#ffffff',
	/** Muted copy on a dark fill. */
	onDarkMuted: '#cbd5e1'
} as const;

/** The canvas every template renders at; the builder and presenter scale it. */
export const SLIDE_WIDTH = 1400;
export const SLIDE_HEIGHT = 850;
