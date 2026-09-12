import type { StaffMember } from '$lib/server/staff';

/**
 * How a roster row names a person, shared by the table cells and the page's
 * dialogs so a member is called the same thing everywhere on the screen.
 * A profile may carry no display name yet (the row is created on signup), so
 * the email is the fallback identity and the placeholder is the last resort.
 */
export function memberName(member: StaffMember): string {
	return member.displayName ?? member.email ?? 'Unnamed member';
}

/**
 * Up to two letters for an avatar fallback: first and last word, or the first
 * two characters. Takes a name rather than a row, because the people an avatar
 * is drawn for do not all arrive as roster rows — a task's assignees are named
 * by `getDisplayNames()` — and two ways of shortening a name is how the same
 * person ends up with different initials on two screens.
 */
export function initialsOf(name: string): string {
	const words = name.split(/[\s@._-]+/).filter(Boolean);
	if (words.length === 0) return '?';
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The same, for a roster row. */
export function memberInitials(member: StaffMember): string {
	return initialsOf(memberName(member));
}
