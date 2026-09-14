import GlobeIcon from '@lucide/svelte/icons/globe';
import MailIcon from '@lucide/svelte/icons/mail';
import PhoneIcon from '@lucide/svelte/icons/phone';

/**
 * Which door a quick fact leads through. A `link` value already says it goes
 * outside the app; the scheme says how — so an email, a phone number and a
 * website are told apart by what they are rather than by the label a
 * describer happened to give them.
 */
export function factIcon(href: string) {
	if (href.startsWith('mailto:')) return MailIcon;
	if (href.startsWith('tel:')) return PhoneIcon;
	return GlobeIcon;
}

/**
 * A record's initials — the first letter of its first two words, the way the
 * thread names a message's author.
 */
export function recordInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter((word) => word !== '')
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join('');
}
