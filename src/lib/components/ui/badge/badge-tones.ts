/**
 * Shared color vocabulary for StatusBadge and TagBadge, so a pill and a tag
 * using the same tone are always the same hue. Ten tones is enough to cover
 * every status/role/tier/priority/category value in the app without pages
 * inventing their own one-off colors.
 */

export type BadgeTone =
	| 'neutral'
	| 'success'
	| 'info'
	| 'warning'
	| 'error'
	| 'violet'
	| 'orange'
	| 'cyan'
	| 'rose'
	| 'indigo';

export const BADGE_TONE_CLASSES = {
	neutral:
		'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700',
	success:
		'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
	info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800',
	warning:
		'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800',
	error:
		'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
	violet:
		'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800',
	orange:
		'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800',
	cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-400 dark:border-cyan-800',
	rose: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800',
	indigo:
		'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800'
} satisfies Record<BadgeTone, string>;

/** Dot color for StatusBadge — a solid saturated fill that reads on both themes. */
export const BADGE_TONE_DOT_CLASSES = {
	neutral: 'bg-slate-400',
	success: 'bg-emerald-500',
	info: 'bg-blue-500',
	warning: 'bg-amber-500',
	error: 'bg-red-500',
	violet: 'bg-violet-500',
	orange: 'bg-orange-500',
	cyan: 'bg-cyan-500',
	rose: 'bg-rose-500',
	indigo: 'bg-indigo-500'
} satisfies Record<BadgeTone, string>;

export const BADGE_TONES =
	// SAFETY: BADGE_TONE_CLASSES satisfies Record<BadgeTone, string> with no
	// extra keys, so its keys are exactly the BadgeTone union.
	Object.keys(BADGE_TONE_CLASSES) as BadgeTone[];
