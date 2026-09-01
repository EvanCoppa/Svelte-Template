import type { Component } from 'svelte';
import BlocksIcon from '@lucide/svelte/icons/blocks';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
import ContactIcon from '@lucide/svelte/icons/contact';
import HandshakeIcon from '@lucide/svelte/icons/handshake';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ListChecksIcon from '@lucide/svelte/icons/list-checks';
import SettingsIcon from '@lucide/svelte/icons/settings';
import TicketIcon from '@lucide/svelte/icons/ticket';
import UsersIcon from '@lucide/svelte/icons/users';

/**
 * The icons a nav entry may name. `features.icon` stores a lucide slug, and
 * this map is the only place it becomes a component — one-per-file imports,
 * so the icon barrel never lands in the bundle and a registry row can never
 * pull in an icon the app did not ship. Add a slug here when a feature
 * needs it; an unknown slug renders the placeholder rather than crashing.
 */
export const ICONS = {
	blocks: BlocksIcon,
	'book-open': BookOpenIcon,
	contact: ContactIcon,
	handshake: HandshakeIcon,
	'layout-dashboard': LayoutDashboardIcon,
	'list-checks': ListChecksIcon,
	settings: SettingsIcon,
	ticket: TicketIcon,
	users: UsersIcon
} satisfies Record<string, NavIcon>;

export type NavIcon = Component<{ class?: string }>;
export type IconName = keyof typeof ICONS;

export function isIconName(name: string | null | undefined): name is IconName {
	return name != null && Object.hasOwn(ICONS, name);
}

/** The component for a slug, or the placeholder for anything unknown. */
export function iconFor(name: string | null | undefined): NavIcon {
	return isIconName(name) ? ICONS[name] : CircleDashedIcon;
}
