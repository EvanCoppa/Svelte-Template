import { BADGE_TONE_CLASSES, type BadgeTone } from '../badge/badge-tones.js';

/**
 * Tint classes for an avatar fallback, so a roster of initials reads as a set
 * of people instead of a column of identical grey circles.
 *
 * The palette is the badge tones — the app's one colour vocabulary — minus
 * `neutral`, which is the grey the fallback already wears by default. The seed
 * must be a stable id (a user id), never a name: the same person then keeps
 * the same colour across renders, sessions and a rename.
 *
 * A person may also pick their own colour on /settings/profile, which is
 * stored as `profiles.avatar_tint` and passed here as `tone`. A null tone —
 * either because they never picked one, or because the caller is drawing
 * someone whose profile row it did not read — falls back to the hash, so the
 * two answers are the same function and a screen never has to branch.
 */
export const AVATAR_TONES = [
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

export type AvatarTone = (typeof AVATAR_TONES)[number];

export function isAvatarTone(value: string | null | undefined): value is AvatarTone {
	return AVATAR_TONES.some((tone) => tone === value);
}

export function avatarTint(seed: string, tone?: string | null): string {
	if (isAvatarTone(tone)) return BADGE_TONE_CLASSES[tone];

	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	return BADGE_TONE_CLASSES[AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]];
}
