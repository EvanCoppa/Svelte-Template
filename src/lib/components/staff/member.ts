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

/** Up to two letters for an avatar fallback: first and last word, or the first two characters. */
export function memberInitials(member: StaffMember): string {
	const words = memberName(member)
		.split(/[\s@._-]+/)
		.filter(Boolean);
	if (words.length === 0) return '?';
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
