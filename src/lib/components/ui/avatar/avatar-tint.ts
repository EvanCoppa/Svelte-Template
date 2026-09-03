import { BADGE_TONE_CLASSES, type BadgeTone } from '../badge/badge-tones.js';

/**
 * Tint classes for an avatar fallback, so a roster of initials reads as a set
 * of people instead of a column of identical grey circles.
 *
 * The palette is the badge tones — the app's one colour vocabulary — minus
 * `neutral`, which is the grey the fallback already wears by default. The seed
 * must be a stable id (a user id), never a name: the same person then keeps
 * the same colour across renders, sessions and a rename.
 */
const AVATAR_TONES = [
	'success',
	'info',
	'warning',
	'error',
	'violet',
	'orange',
	'cyan',
	'rose',
	'indigo'
] as const satisfies readonly BadgeTone[];

export function avatarTint(seed: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	return BADGE_TONE_CLASSES[AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]];
}
