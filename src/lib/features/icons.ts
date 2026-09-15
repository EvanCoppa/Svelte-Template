import type { Component } from 'svelte';
import BlocksIcon from '@lucide/svelte/icons/blocks';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import BoxIcon from '@lucide/svelte/icons/box';
import Building2Icon from '@lucide/svelte/icons/building-2';
import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
import CircleUserIcon from '@lucide/svelte/icons/circle-user';
import ContactIcon from '@lucide/svelte/icons/contact';
import FileSignatureIcon from '@lucide/svelte/icons/file-signature';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import Grid3x3Icon from '@lucide/svelte/icons/grid-3x3';
import HandshakeIcon from '@lucide/svelte/icons/handshake';
import LayersIcon from '@lucide/svelte/icons/layers';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ListChecksIcon from '@lucide/svelte/icons/list-checks';
import MailIcon from '@lucide/svelte/icons/mail';
import MapIcon from '@lucide/svelte/icons/map';
import MapPinIcon from '@lucide/svelte/icons/map-pin';
import PackageIcon from '@lucide/svelte/icons/package';
import PencilRulerIcon from '@lucide/svelte/icons/pencil-ruler';
import PresentationIcon from '@lucide/svelte/icons/presentation';
import ReceiptIcon from '@lucide/svelte/icons/receipt';
import RouteIcon from '@lucide/svelte/icons/route';
import ReceiptTextIcon from '@lucide/svelte/icons/receipt-text';
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
import ShieldIcon from '@lucide/svelte/icons/shield';
import ShoppingBagIcon from '@lucide/svelte/icons/shopping-bag';
import ShoppingCartIcon from '@lucide/svelte/icons/shopping-cart';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import SparklesIcon from '@lucide/svelte/icons/sparkles';
import StarIcon from '@lucide/svelte/icons/star';
import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
import TicketIcon from '@lucide/svelte/icons/ticket';
import TicketPercentIcon from '@lucide/svelte/icons/ticket-percent';
import ToggleRightIcon from '@lucide/svelte/icons/toggle-right';
import TruckIcon from '@lucide/svelte/icons/truck';
import UsersIcon from '@lucide/svelte/icons/users';
import WalletIcon from '@lucide/svelte/icons/wallet';
import WaypointsIcon from '@lucide/svelte/icons/waypoints';

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
	'file-signature': FileSignatureIcon,
	'file-text': FileTextIcon,
	'grid-3x3': Grid3x3Icon,
	handshake: HandshakeIcon,
	layers: LayersIcon,
	'layout-dashboard': LayoutDashboardIcon,
	'list-checks': ListChecksIcon,
	mail: MailIcon,
	map: MapIcon,
	'map-pin': MapPinIcon,
	package: PackageIcon,
	'pencil-ruler': PencilRulerIcon,
	presentation: PresentationIcon,
	receipt: ReceiptIcon,
	'receipt-text': ReceiptTextIcon,
	'rotate-ccw': RotateCcwIcon,
	route: RouteIcon,
	shield: ShieldIcon,
	'shopping-bag': ShoppingBagIcon,
	'shopping-cart': ShoppingCartIcon,
	'sliders-horizontal': SlidersHorizontalIcon,
	sparkles: SparklesIcon,
	star: StarIcon,
	'sticky-note': StickyNoteIcon,
	ticket: TicketIcon,
	'ticket-percent': TicketPercentIcon,
	'toggle-right': ToggleRightIcon,
	truck: TruckIcon,
	users: UsersIcon,
	wallet: WalletIcon,
	waypoints: WaypointsIcon
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
