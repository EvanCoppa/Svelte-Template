import type { Component } from 'svelte';
import BlocksIcon from '@lucide/svelte/icons/blocks';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import BoxIcon from '@lucide/svelte/icons/box';
import Building2Icon from '@lucide/svelte/icons/building-2';
import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
import CircleUserIcon from '@lucide/svelte/icons/circle-user';
import ContactIcon from '@lucide/svelte/icons/contact';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import HandshakeIcon from '@lucide/svelte/icons/handshake';
import LayersIcon from '@lucide/svelte/icons/layers';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ListChecksIcon from '@lucide/svelte/icons/list-checks';
import MapIcon from '@lucide/svelte/icons/map';
import MapPinIcon from '@lucide/svelte/icons/map-pin';
import PackageIcon from '@lucide/svelte/icons/package';
import ReceiptTextIcon from '@lucide/svelte/icons/receipt-text';
import ShieldIcon from '@lucide/svelte/icons/shield';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import SparklesIcon from '@lucide/svelte/icons/sparkles';
import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
import TicketIcon from '@lucide/svelte/icons/ticket';
import ToggleRightIcon from '@lucide/svelte/icons/toggle-right';
import TruckIcon from '@lucide/svelte/icons/truck';
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
	box: BoxIcon,
	'building-2': Building2Icon,
	'calendar-days': CalendarDaysIcon,
	'circle-user': CircleUserIcon,
	contact: ContactIcon,
	'file-text': FileTextIcon,
	handshake: HandshakeIcon,
	layers: LayersIcon,
	'layout-dashboard': LayoutDashboardIcon,
	'list-checks': ListChecksIcon,
	map: MapIcon,
	'map-pin': MapPinIcon,
	package: PackageIcon,
	'receipt-text': ReceiptTextIcon,
	shield: ShieldIcon,
	'sliders-horizontal': SlidersHorizontalIcon,
	sparkles: SparklesIcon,
	'sticky-note': StickyNoteIcon,
	ticket: TicketIcon,
	'toggle-right': ToggleRightIcon,
	truck: TruckIcon,
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
