<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		Accordion,
		type AccordionItem,
		BlurUpImage,
		CollapsibleBanner,
		ContextMenu,
		type ContextMenuItem,
		CopyButton,
		ExpandingSearch,
		FilterGrid,
		type FilterDefinition,
		FloatingLabelInput,
		HideOnScroll,
		HoldToConfirm,
		IconMorph,
		type IconMorphPreset,
		type IconMorphSemantics,
		InlineValidation,
		Lightbox,
		LikeBurst,
		LiveActivity,
		type Activity,
		LoadMore,
		LoadingButton,
		LogoMarquee,
		type LogoMarqueeItem,
		LongPressButton,
		NewItemsPill,
		OtpInput,
		type OtpStatus,
		Pagination,
		PasswordStrength,
		PollResults,
		type PollOption,
		PresenceAvatars,
		type PresencePerson,
		PressDepth,
		ProgressBar,
		ReadingProgress,
		ReorderList,
		Ripple,
		ScrollSpy,
		SegmentedControl,
		type SegmentedOption,
		ShowMore,
		SkeletonSwap,
		SliderDetents,
		SnapCarousel,
		SortableTable,
		type SortableColumn,
		StickyHeader,
		StreamingText,
		SwipeDeck,
		type SwipeChoice,
		TagInput,
		TaskSteps,
		TextReveal,
		TooltipGroup,
		Tooltip as EnhancedTooltip,
		TreeView,
		type TreeNode,
		TypingIndicator,
		UntitledButton,
		ValueFlash,
		WizardSteps,
		type WizardStep
	} from '$lib/components/enhanced/index.js';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as UpgradeModal from '$lib/components/upgrade-modal/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Combobox, optionsFromLabels } from '$lib/components/ui/combobox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { showUpgrade } from '$lib/upgrade.svelte';
	import { cn } from '$lib/utils.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import {
		CalendarDate,
		DateFormatter,
		getLocalTimeZone,
		type DateValue
	} from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import MegaphoneIcon from '@lucide/svelte/icons/megaphone';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import {
		createColumnHelper,
		createTable,
		createTableState,
		renderComponent,
		renderSnippet,
		type RowSelectionState
	} from '@tanstack/svelte-table';
	import { createRawSnippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	// Select (bits-ui) works with plain string values.
	const FRUIT_LABELS = {
		apple: 'Apple',
		banana: 'Banana',
		cherry: 'Cherry',
		grape: 'Grape'
	} satisfies Record<string, string>;
	const FRUIT_OPTIONS = Object.entries(FRUIT_LABELS);
	let fruit = $state('');
	let fruitLabel = $derived(
		FRUIT_OPTIONS.find(([value]) => value === fruit)?.[1] ?? 'Pick a fruit'
	);

	// Combobox — the searchable picker this codebase prefers over raw selects.
	const ROLE_LABELS = {
		admin: 'Administrator',
		editor: 'Editor',
		viewer: 'Viewer',
		billing: 'Billing manager'
	} satisfies Record<string, string>;
	let role = $state('');
	let tags = $state<string[]>([]);
	let showcaseDate = $state<DateValue | undefined>();
	const tagOptions = ['Design', 'Engineering', 'Marketing', 'Sales', 'Support'];

	// Command — the raw list-filtering primitive Combobox is built on.
	const COMMAND_FRUITS = ['Apple', 'Banana', 'Cherry', 'Grape', 'Mango', 'Peach'];
	let commandPick = $state('');

	let acceptTerms = $state(false);
	let notifications = $state(true);
	let dialogOpen = $state(false);
	// Upgrade modal — demo copy; the app's own (`showUpgrade()`) pitches from the feature registry.
	let upgradeDemoOpen = $state(false);
	function requestUpgradeDemo() {
		upgradeDemoOpen = false;
		toast.success('Upgrade requested');
	}
	const UPGRADE_PERKS = [
		{ name: 'Deals', description: 'Pipeline of opportunities, by stage and value.' },
		{ name: 'Reports', description: 'Forecasts and win rates, by owner and by month.' },
		{ name: 'Priority support', description: 'A named contact and a one-business-day reply.' }
	];
	// Modal — the demo form posts nowhere; a real page wires a form action here.
	let modalOpen = $state(false);
	let campaignName = $state('');
	function createCampaign(event: SubmitEvent) {
		event.preventDefault();
		toast.success(`Created "${campaignName.trim()}"`);
		modalOpen = false;
		campaignName = '';
	}
	// Modal — a longer multi-field form, still one form wrapping Card + Footer.
	let appointmentModalOpen = $state(false);
	const PATIENT_LABELS = {
		'ava-thompson': 'Ava Thompson (#1)',
		'liam-chen': 'Liam Chen (#2)',
		'noah-patel': 'Noah Patel (#3)'
	} satisfies Record<string, string>;
	const PROVIDER_LABELS = {
		'elena-ruiz': 'Dr. Elena Ruiz',
		'marcus-lee': 'Dr. Marcus Lee'
	} satisfies Record<string, string>;
	const APPOINTMENT_TYPE_LABELS = {
		'new-patient-exam': 'New Patient Exam',
		cleaning: 'Cleaning',
		filling: 'Filling',
		'root-canal': 'Root Canal',
		consultation: 'Consultation'
	} satisfies Record<string, string>;
	const DURATION_LABELS = {
		'15': '15 min',
		'30': '30 min',
		'45': '45 min',
		'60': '60 min',
		'90': '90 min'
	} satisfies Record<string, string>;
	const TIME_SLOTS = [
		'8:00 AM',
		'8:30 AM',
		'9:00 AM',
		'9:30 AM',
		'10:00 AM',
		'10:30 AM',
		'11:00 AM',
		'1:00 PM',
		'1:30 PM',
		'2:00 PM',
		'2:30 PM',
		'3:00 PM',
		'4:00 PM'
	];
	const appointmentDateFormatter = new DateFormatter('en-US', { dateStyle: 'long' });
	let appointmentPatient = $state('ava-thompson');
	let appointmentProvider = $state('elena-ruiz');
	let appointmentType = $state('new-patient-exam');
	let appointmentDate = $state<DateValue | undefined>(new CalendarDate(2026, 9, 5));
	let appointmentDateOpen = $state(false);
	let appointmentTime = $state('9:00 AM');
	let appointmentDuration = $state('30');
	let appointmentNotes = $state('');
	let createMoreAppointments = $state(false);
	const appointmentDateLabel = $derived(
		appointmentDate
			? appointmentDateFormatter.format(appointmentDate.toDate(getLocalTimeZone()))
			: 'Pick a date'
	);
	function scheduleAppointment(event: SubmitEvent) {
		event.preventDefault();
		toast.success(`Scheduled for ${appointmentDateLabel} at ${appointmentTime}`);
		appointmentNotes = '';
		if (!createMoreAppointments) {
			appointmentModalOpen = false;
		}
	}

	let popoverOpen = $state(false);
	let sheetOpen = $state(false);

	const invoices = [
		{ id: 'INV-001', status: 'Paid', method: 'Credit card', amount: '$250.00' },
		{ id: 'INV-002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
		{ id: 'INV-003', status: 'Unpaid', method: 'Bank transfer', amount: '$350.00' }
	];

	// Data table — the page owns the rows, the columns and the table instance;
	// the DataTable parts only render it.
	type Payment = {
		id: string;
		email: string;
		status: 'Paid' | 'Pending' | 'Refunded';
		amount: number;
	};

	const payments: Payment[] = [
		{ id: 'PAY-001', email: 'ken99@yahoo.com', status: 'Paid', amount: 316 },
		{ id: 'PAY-002', email: 'abe45@gmail.com', status: 'Paid', amount: 242 },
		{ id: 'PAY-003', email: 'monserrat44@gmail.com', status: 'Pending', amount: 837 },
		{ id: 'PAY-004', email: 'silas22@gmail.com', status: 'Paid', amount: 874 },
		{ id: 'PAY-005', email: 'carmella@hotmail.com', status: 'Refunded', amount: 721 },
		{ id: 'PAY-006', email: 'lulu.runolfsdottir@example.com', status: 'Pending', amount: 129 },
		{ id: 'PAY-007', email: 'esteban.torp@example.com', status: 'Paid', amount: 458 },
		{ id: 'PAY-008', email: 'jailyn.walter@example.com', status: 'Paid', amount: 390 },
		{ id: 'PAY-009', email: 'ottilie.mertz@example.com', status: 'Refunded', amount: 65 },
		{ id: 'PAY-010', email: 'derick.koss@example.com', status: 'Pending', amount: 512 },
		{ id: 'PAY-011', email: 'name.mcglynn@example.com', status: 'Paid', amount: 283 },
		{ id: 'PAY-012', email: 'wilber.veum@example.com', status: 'Paid', amount: 947 }
	];

	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const amountCell = createRawSnippet<[{ amount: number }]>((getAmount) => {
		const { amount } = getAmount();
		return {
			render: () => `<div class="font-medium tabular-nums">${usd.format(amount)}</div>`
		};
	});

	const paymentColumnHelper = createColumnHelper<DataTable.DataTableFeatures, Payment>();

	const paymentColumns = paymentColumnHelper.columns([
		DataTable.selectColumn(paymentColumnHelper),
		paymentColumnHelper.accessor('email', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Email' })
		}),
		paymentColumnHelper.accessor('status', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Status' })
		}),
		paymentColumnHelper.accessor('amount', {
			header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Amount' }),
			cell: ({ row }) => renderSnippet(amountCell, { amount: row.original.amount })
		})
	]);

	// Row selection lives outside the table so the page can read or reset it.
	const [paymentSelection, setPaymentSelection] = createTableState<RowSelectionState>({});

	const paymentsTable = createTable({
		features: DataTable.features,
		get data() {
			return payments;
		},
		columns: paymentColumns,
		initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
		state: {
			get rowSelection() {
				return paymentSelection();
			}
		},
		onRowSelectionChange: setPaymentSelection
	});

	const paymentEmailFilter = $derived(
		String(paymentsTable.getColumn('email')?.getFilterValue() ?? '')
	);

	// Segmented control — a radiogroup, so the value is a plain string.
	const ranges: SegmentedOption[] = [
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
		{ value: 'quarter', label: 'Quarter', disabled: true }
	];
	let range = $state('week');

	// Floating label.
	let workspace = $state('');
	let handle = $state('');
	const handleInvalid = $derived(handle.length > 0 && !/^[a-z0-9-]+$/.test(handle));

	// Inline validation — the validator returns the fault, or null when clean.
	let email = $state('');
	function validateEmail(value: string): string | null {
		if (value.length === 0) return 'An email is required';
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'That does not look like an email';
		return null;
	}

	// OTP — 123456 is the code that passes, anything else is rejected.
	let code = $state('');
	let codeStatus = $state<OtpStatus>('idle');

	function checkCode(value: string) {
		codeStatus = value === '123456' ? 'success' : 'error';
	}

	// Tag input.
	let skills = $state<string[]>(['Svelte', 'TypeScript']);

	// Password strength — paired with a plain ui/input, which still owns the field.
	let password = $state('');

	// Loading button — one that resolves, one that rejects.
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function saveProfile() {
		await wait(1200);
	}

	async function failToSave() {
		await wait(1200);
		throw new Error('The server said no');
	}

	// Untitled UI button — `loading` is a plain prop, so the page owns the flag.
	let untitledLoading = $state(false);

	async function runUntitledDemo() {
		if (untitledLoading) return;
		untitledLoading = true;
		await wait(1600);
		untitledLoading = false;
	}
	// Self-contained demo "photos" — inline SVGs instead of a third-party image host,
	// since the CSP's img-src only allows this app's own origin plus a short allowlist.
	function photoDataUri(w: number, h: number, from: string, to: string, label: string): string {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.round(Math.min(w, h) / 9)}" fill="rgba(255,255,255,0.92)">${label}</text></svg>`;
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}

	// Accordion
	const accordionSizes = [
		'XS — 44cm chest, 66cm length',
		'S — 48cm chest, 68cm length',
		'M — 52cm chest, 70cm length',
		'L — 56cm chest, 72cm length'
	];
	const accordionItems: AccordionItem[] = [
		{ id: 'shipping', title: 'Shipping', meta: '3 zones' },
		{ id: 'returns', title: 'Returns', meta: '30 days' },
		{ id: 'sizing', title: 'Sizing' }
	];

	// Blur-up image
	const BLUR_LQIP =
		'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QDURXhpZgAATU0AKgAAAAgABQESAAMAAAABAAEAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAIdpAAQAAAABAAAAWgAAAAAAAABIAAAAAQAAAEgAAAABAAeQAAAHAAAABDAyMTCRAQAHAAAABAECAwCShgAHAAAAFwAAALSgAAAHAAAABDAxMDCgAQADAAAAAQABAACgAgAEAAAAAQAAABigAwAEAAAAAQAAAA8AAAAAQVNDSUkAAABQaWNzdW0gSUQ6IDEwNDAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/CABEIAA8AGAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAADAgQBBQAGBwgJCgv/xADDEAABAwMCBAMEBgQHBgQIBnMBAgADEQQSIQUxEyIQBkFRMhRhcSMHgSCRQhWhUjOxJGIwFsFy0UOSNIII4VNAJWMXNfCTc6JQRLKD8SZUNmSUdMJg0oSjGHDiJ0U3ZbNVdaSVw4Xy00Z2gONHVma0CQoZGigpKjg5OkhJSldYWVpnaGlqd3h5eoaHiImKkJaXmJmaoKWmp6ipqrC1tre4ubrAxMXGx8jJytDU1dbX2Nna4OTl5ufo6erz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAECAAMEBQYHCAkKC//EAMMRAAICAQMDAwIDBQIFAgQEhwEAAhEDEBIhBCAxQRMFMCIyURRABjMjYUIVcVI0gVAkkaFDsRYHYjVT8NElYMFE4XLxF4JjNnAmRVSSJ6LSCAkKGBkaKCkqNzg5OkZHSElKVVZXWFlaZGVmZ2hpanN0dXZ3eHl6gIOEhYaHiImKkJOUlZaXmJmaoKOkpaanqKmqsLKztLW2t7i5usDCw8TFxsfIycrQ09TV1tfY2drg4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/9oADAMBAAIRAxEAAAH2YnwA804fpvg/F+3F/9oACAEBAAEFAo9z29NuvcLHc7bc7vbrBEe63sYF1NcmESSyf//aAAgBAxEBPwEYKFFj0of/2gAIAQIRAT8Bn1p8kMvk6f/aAAgBAQAGPwL3iPEUBXRHm+if7PZ/hf8AGZEEngkdav1MITJTHgxEpaiE1I183EqmeuvlV//EADMQAQADAAICAgICAwEBAAACCxEhMQBBUWFxgZGhscHR8PH/2gAIAQEAAT8hmN2KSiWABX6vAuV3uTyEfileBdD/AEqpTiHWRd8aDQjzzWSepy15fi//2gAMAwEAAhEDEQAAEMQP/8QAMxEBAQEAAwABAgUFAQEAAQEJAQARITEQQVFhIHHwkYGhsdHB4fEwQFBgcICQoLDA0OD/2gAIAQMRAT8Q0E7/AGsfN//aAAgBAhEBPxDZwc++/wBckWKfy3//2gAIAQEAAT8QhVWIZ6ZwvOnxYplHheQQ51w9LWF43YHLEAnl+OcpcuVwyS48i/mwSyTq5nIiTCVFOhFBCGQhUWrf/9k=';
	const BLUR_PHOTO_A = photoDataUri(640, 400, '#f97316', '#7c2d12', 'Photo A');
	const BLUR_PHOTO_B = photoDataUri(640, 400, '#0ea5e9', '#0c4a6e', 'Photo B');
	const BLUR_DEAD = 'data:image/png;base64,not-a-real-image';
	let blurSrc = $state<string | undefined>(BLUR_PHOTO_A);

	// Context menu
	const contextMenuFiles = [
		{ id: 'file-0', name: 'cover-final-v4.png', meta: 'PNG · 1.2 MB' },
		{ id: 'file-1', name: 'hero-crop@2x.png', meta: 'PNG · 840 KB' },
		{ id: 'file-2', name: 'desk-shot-0912.jpg', meta: 'JPG · 2.4 MB' }
	];
	let trashed = $state<string[]>([]);
	const visibleFiles = $derived(contextMenuFiles.filter((file) => !trashed.includes(file.id)));
	function fileMenuItems(id: string): ContextMenuItem[] {
		return [
			{ id: 'open', label: 'Open', shortcut: '↵' },
			{ id: 'rename', label: 'Rename', shortcut: 'F2' },
			{ id: 'copy', label: 'Copy link', shortcut: '⌘L' },
			{ id: 'info', label: 'Get info', disabled: true },
			{ id: 'sep', type: 'separator' },
			{
				id: 'trash',
				label: 'Move to trash',
				shortcut: '⌫',
				onSelect: () => {
					trashed = [...trashed, id];
				}
			}
		];
	}

	// Expanding search
	const interactionLibrary = [
		'Hold to confirm',
		'Icon morph',
		'Press depth',
		'Ripple',
		'Tag input',
		'Value flash'
	];
	let searchQuery = $state('');
	let settledQuery = $state('');
	const searchResults = $derived(
		interactionLibrary.filter((item) =>
			item.toLowerCase().includes(settledQuery.trim().toLowerCase())
		)
	);

	// Filter grid
	type Asset = { id: string; name: string; kind: 'image' | 'clip' | 'doc'; size: string };
	const assets: Asset[] = [
		{ id: 'a1', name: 'hero-wide', kind: 'image', size: '2.4 MB' },
		{ id: 'a2', name: 'onboarding', kind: 'clip', size: '18 MB' },
		{ id: 'a3', name: 'brand-deck', kind: 'doc', size: '840 KB' },
		{ id: 'a4', name: 'swatches', kind: 'image', size: '410 KB' },
		{ id: 'a5', name: 'changelog', kind: 'doc', size: '22 KB' },
		{ id: 'a6', name: 'teaser-cut', kind: 'clip', size: '31 MB' }
	];
	const assetFilters: FilterDefinition<Asset>[] = [
		{ id: 'all', label: 'All', match: () => true },
		{ id: 'image', label: 'Images', match: (a) => a.kind === 'image' },
		{ id: 'clip', label: 'Clips', match: (a) => a.kind === 'clip' },
		{ id: 'doc', label: 'Docs', match: (a) => a.kind === 'doc' }
	];
	let assetFilter = $state('all');

	// Hide on scroll
	const HIDE_ON_SCROLL_ARTICLE = [
		'A ship at sea can read its latitude off the sun. Longitude is a question about time: how far local noon has drifted from noon at a port whose position is already known.',
		'The pendulum clocks of the seventeenth century kept excellent time on land and none at all on a deck that pitched, rolled, and changed temperature twice a day.',
		'John Harrison spent thirty-one years on it. The first three machines were large, ingenious, and impractical. The fourth was the size of a pocket watch.',
		'H4 lost five seconds on the passage to Jamaica in 1761 — about a minute and a quarter of longitude, comfortably inside what the prize demanded.',
		'The Board of Longitude paid him in instalments, over fourteen years, and never in full.',
		'Within a generation the chronometer was ordinary. Ships carried three, because two that disagree tell you nothing at all.'
	];
	const HIDE_ON_SCROLL_BOOKMARK = 'M184,224l-56-40L72,224V48a8,8,0,0,1,8-8h96a8,8,0,0,1,8,8Z';
	let bookmarked = $state(false);

	// Icon morph
	const ICON_MORPH_ROW: Array<{ preset: IconMorphPreset; semantics: IconMorphSemantics }> = [
		{ preset: 'play-pause', semantics: 'pressed' },
		{ preset: 'menu-close', semantics: 'expanded' },
		{ preset: 'plus-minus', semantics: 'pressed' },
		{ preset: 'check-close', semantics: 'label' }
	];

	// Lightbox — asset substitution: Solid Core's preview referenced local /demo/*.jpg files that
	// don't exist here, so these use inline SVG placeholders instead.
	type LightboxShot = { id: string; src: string; title: string; alt: string; w: number; h: number };
	const LIGHTBOX_SHOTS: LightboxShot[] = [
		{
			id: 'river',
			src: photoDataUri(1280, 800, '#0891b2', '#164e63', 'River valley'),
			title: 'River valley',
			alt: 'River winding through a mountain valley',
			w: 1280,
			h: 800
		},
		{
			id: 'castle',
			src: photoDataUri(1280, 800, '#65a30d', '#365314', 'Hillside castle'),
			title: 'Hillside castle',
			alt: 'Hilltop castle above a wooded valley, under a clouded sky',
			w: 1280,
			h: 800
		}
	];
	let lightboxOpen = $state(false);
	let activeShot = $state<LightboxShot>(LIGHTBOX_SHOTS[0]);
	let lightboxOrigin = $state<HTMLElement | null>(null);
	function showShot(shot: LightboxShot, event: MouseEvent) {
		// SAFETY: this handler is only ever bound to the thumbnail buttons below.
		lightboxOrigin = event.currentTarget as HTMLElement;
		activeShot = shot;
		lightboxOpen = true;
	}

	// Like burst
	let likeBurstControl = $state<{ toggle: () => void } | null>(null);
	let liked = $state(false);
	// The card likes itself back after a beat, so the spark burst is visible at rest.
	$effect(() => {
		if (!liked) return;
		const back = setTimeout(() => likeBurstControl?.toggle(), 1500);
		return () => clearTimeout(back);
	});

	// Live activity
	const LIVE_ACTIVITY_LINES = ['w-[88%]', 'w-[64%]', 'w-[76%]', 'w-[52%]', 'w-[70%]'];
	let activity = $state<Activity | null>(null);
	let runs = 0;
	let seq = 0;
	let ticker: ReturnType<typeof setInterval> | undefined;
	let linger: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => {
		if (ticker) clearInterval(ticker);
		if (linger) clearTimeout(linger);
	});
	function stopTicker() {
		if (ticker) clearInterval(ticker);
		ticker = undefined;
	}
	function dismissActivity() {
		stopTicker();
		if (linger) clearTimeout(linger);
		activity = null;
	}
	function deploy() {
		stopTicker();
		if (linger) clearTimeout(linger);

		runs += 1;
		seq += 1;
		const total = 24;
		const failing = runs % 3 === 0;

		activity = {
			id: `activity-${seq}`,
			title: 'Deploying site',
			detail: 'solid-core · production',
			progress: 0,
			phase: 'running'
		};

		let step = 0;
		ticker = setInterval(() => {
			step += 1;

			if (failing && step >= Math.round(total * 0.6)) {
				stopTicker();
				activity = activity && {
					...activity,
					phase: 'error',
					detail: `Build failed at step ${step} of ${total}`,
					action: { label: 'Retry', onSelect: deploy }
				};
				return;
			}

			if (step >= total) {
				stopTicker();
				activity = activity && {
					...activity,
					phase: 'success',
					progress: 1,
					detail: 'Live at solid-core.dev'
				};
				// A finished activity leaves on its own; a failed one never does.
				linger = setTimeout(() => {
					activity = null;
				}, 2000);
				return;
			}

			activity = activity && { ...activity, progress: step / total };
		}, 140);
	}
	// The card deploys itself once mounted, so the pod is visible without a click.
	onMount(() => {
		const kickoff = setTimeout(deploy, 400);
		return () => clearTimeout(kickoff);
	});

	// Load more
	const PAGE_SIZE = 6;
	const TOTAL = 24;
	let feedCount = $state(PAGE_SIZE);
	let feedScroller = $state<HTMLDivElement | null>(null);
	const feedTimers = new SvelteSet<ReturnType<typeof setTimeout>>();
	onDestroy(() => {
		feedTimers.forEach(clearTimeout);
		feedTimers.clear();
	});
	function loadFeed() {
		return new Promise<boolean>((resolve) => {
			const id = setTimeout(() => {
				feedTimers.delete(id);
				feedCount = Math.min(TOTAL, feedCount + PAGE_SIZE);
				resolve(feedCount < TOTAL);
			}, 700);
			feedTimers.add(id);
		});
	}

	// Logo marquee
	const marqueeBrands: { id: string; name: string; d: string }[] = [
		{ id: 'vercel', name: 'Vercel', d: 'm12 1.608 12 20.784H0Z' },
		{
			id: 'github',
			name: 'GitHub',
			d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'
		},
		{
			id: 'stripe',
			name: 'Stripe',
			d: 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z'
		},
		{
			id: 'linear',
			name: 'Linear',
			d: 'M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z'
		},
		{ id: 'framer', name: 'Framer', d: 'M4 0h16v8h-8zM4 8h8l8 8H4zM4 16h8v8z' }
	];
	const marqueePaths = new SvelteMap(marqueeBrands.map((brand) => [brand.id, brand.d]));
	const marqueeItems: LogoMarqueeItem[] = marqueeBrands.map((brand) => ({
		id: brand.id,
		label: brand.name
	}));

	// Long press
	let archived = $state(false);

	// New items pill
	const activityWho = ['Wren', 'Ada', 'Iris', 'Noor', 'Kaz', 'Milo'];
	const activityWhat = [
		'shipped the scroll restoration fix',
		'left a note on the pricing page',
		'moved two tickets to review',
		'published the changelog'
	];
	let activityIds = $state<number[]>(Array.from({ length: 14 }, (_, i) => 13 - i));
	let activityScroller = $state<HTMLDivElement | null>(null);
	let nextActivityId = 14;
	$effect(() => {
		const timer = setInterval(() => {
			nextActivityId += 1;
			activityIds = [nextActivityId, ...activityIds.slice(0, 59)];
		}, 2500);
		return () => clearInterval(timer);
	});

	// Pagination
	let resultsPage = $state(1);

	// Poll results
	let pollOptions = $state<PollOption[]>([
		{ id: 'oak', label: 'Oak, oiled', votes: 54 },
		{ id: 'travertine', label: 'Travertine', votes: 41 },
		{ id: 'brick', label: 'Painted brick', votes: 17 },
		{ id: 'concrete', label: 'Concrete, sealed', votes: 9 }
	]);
	function castVote(id: string) {
		pollOptions = pollOptions.map((option) =>
			option.id === id ? { ...option, votes: option.votes + 1 } : option
		);
	}

	// Presence avatars — inline SVG faces instead of a third-party avatar host.
	const roster: PresencePerson[] = [
		{ id: 'ana', name: 'Ana Ruiz', src: photoDataUri(96, 96, '#f43f5e', '#881337', 'AR') },
		{ id: 'ivo', name: 'Ivo Bergman', src: photoDataUri(96, 96, '#8b5cf6', '#4c1d95', 'IB') },
		{ id: 'noor', name: 'Noor Haddad', src: photoDataUri(96, 96, '#14b8a6', '#134e4a', 'NH') },
		{ id: 'kei', name: 'Kei Tanaka', src: photoDataUri(96, 96, '#eab308', '#713f12', 'KT') },
		{ id: 'sam', name: 'Sam Okonkwo', src: photoDataUri(96, 96, '#3b82f6', '#1e3a8a', 'SO') }
	];
	let here = $state<string[]>(['ana', 'ivo', 'noor']);
	const people = $derived(
		here
			.map((id) => roster.find((person) => person.id === id))
			.filter((person): person is PresencePerson => Boolean(person))
	);
	function join() {
		const next = roster.find((person) => !here.includes(person.id));
		if (next) here = [...here, next.id];
	}
	function leave() {
		here = here.slice(1);
	}

	// Progress bar — simulated upload: indeterminate while sizing, then determinate steps, then restarts.
	let uploadValue = $state<number | null>(null);
	$effect(() => {
		const current = uploadValue;
		if (current === null) {
			const timer = setTimeout(() => (uploadValue = 8), 1300);
			return () => clearTimeout(timer);
		}
		if (current < 100) {
			const timer = setTimeout(() => (uploadValue = Math.min(100, current + 14)), 520);
			return () => clearTimeout(timer);
		}
		const timer = setTimeout(() => (uploadValue = null), 1800);
		return () => clearTimeout(timer);
	});

	// Reading progress
	const readingParagraphs = [
		'The house had been empty for eleven years before anyone thought to measure it. The surveyor arrived on a Tuesday with a folding rule and a notebook, and left in the dark with neither of them full.',
		'What he found first was that none of the rooms agreed with the plan. The kitchen was a foot short in one direction and a foot long in the other, as though the walls had been shuffled overnight.',
		'He drew the discrepancy twice, then a third time, and the third drawing was the one he kept. It showed the stair landing sitting half a step above where the drawing said it should.',
		'By four o’clock the rule had stopped being useful. The remaining questions were about height and weight and the way a floor answers a footstep, and none of those are questions a rule can be pointed at.'
	];
	const readingWords = readingParagraphs.join(' ').split(/\s+/).length;
	let readingScroller = $state<HTMLDivElement | null>(null);

	// Reorder list
	type AgendaItem = { id: string; title: string; length: string };
	const agenda: AgendaItem[] = [
		{ id: 'agenda-1', title: 'Opening remarks', length: '5 min' },
		{ id: 'agenda-2', title: 'Roadmap review', length: '15 min' },
		{ id: 'agenda-3', title: 'Design critique', length: '20 min' },
		{ id: 'agenda-4', title: 'Open questions', length: '10 min' }
	];
	let agendaRows = $state<AgendaItem[]>(agenda);
	function handleReorder(next: AgendaItem[]) {
		agendaRows = next;
	}

	// Scroll spy — sections resolve by the id they already have in the document.
	const scrollSections = [
		{ id: 'scrollspy-overview', label: 'Overview' },
		{ id: 'scrollspy-pricing', label: 'Pricing' },
		{ id: 'scrollspy-limits', label: 'Limits' }
	];
	let scrollBox = $state<HTMLDivElement | null>(null);

	// Skeleton swap — loops so the crossfade is visible without any interaction.
	let profileReady = $state(false);
	$effect(() => {
		const wait = profileReady ? 2600 : 1100;
		const t = setTimeout(() => (profileReady = !profileReady), wait);
		return () => clearTimeout(t);
	});

	// Slider detents — playback speed with named stops the pointer snaps to.
	const speedDetents = [
		{ value: 0.5, label: '0.5×' },
		{ value: 1, label: 'Normal' },
		{ value: 1.5, label: '1.5×' },
		{ value: 2, label: '2×' }
	];
	let playbackSpeed = $state(1);
	const formatSpeed = (v: number) => `${v.toFixed(2)}×`;

	// Snap carousel — drag, flick or use the dots; arrow keys move a slide at a time.
	type Room = { id: string; name: string; line: string; image: string };
	const rooms: Room[] = [
		{
			id: 'atrium',
			name: 'Atrium',
			line: 'North light, all afternoon',
			image: photoDataUri(320, 200, '#fbbf24', '#78350f', 'Atrium')
		},
		{
			id: 'stair',
			name: 'Stair hall',
			line: 'Travertine, half a step out',
			image: photoDataUri(320, 200, '#a8a29e', '#44403c', 'Stair hall')
		},
		{
			id: 'kitchen',
			name: 'Kitchen',
			line: 'Oak run, brass where hands land',
			image: photoDataUri(320, 200, '#34d399', '#065f46', 'Kitchen')
		}
	];

	// Sortable table — click a header to sort; rows glide by transform, never reflow.
	type Reviewer = { id: string; name: string; open: number; seen: string; ago: number };
	const reviewers: Reviewer[] = [
		{ id: 'r1', name: 'Priya Raman', open: 12, seen: '2h ago', ago: 120 },
		{ id: 'r2', name: 'Marco Silva', open: 3, seen: '1d ago', ago: 1440 },
		{ id: 'r3', name: 'Ada Okonjo', open: 21, seen: '18m ago', ago: 18 },
		{ id: 'r4', name: 'Tom Beckett', open: 7, seen: '4d ago', ago: 5760 }
	];
	const reviewerColumns: SortableColumn<Reviewer>[] = [
		{ id: 'name', header: 'Reviewer', value: (r) => r.name },
		{
			id: 'open',
			header: 'Open',
			width: '72px',
			align: 'end',
			numeric: true,
			value: (r) => r.open
		},
		{
			id: 'seen',
			header: 'Last seen',
			width: '96px',
			align: 'end',
			value: (r) => r.ago,
			cell: (r) => r.seen
		}
	];

	// Sticky header
	const stickyMessages = [
		{ id: '1', from: 'Nadia Okonkwo', line: 'Re: pricing page copy' },
		{ id: '2', from: 'Build bot', line: 'main passed in 3m 12s' },
		{ id: '3', from: 'Sam Ferreira', line: 'Invoice for October' },
		{ id: '4', from: 'Design weekly', line: 'Notes from Thursday' },
		{ id: '5', from: 'Priya Raman', line: 'Contract redlines attached' },
		{ id: '6', from: 'Status', line: 'Region eu-west-1 recovered' },
		{ id: '7', from: 'Tom Vale', line: 'Can we move standup?' },
		{ id: '8', from: 'Ines Cardoso', line: 'Two questions about the audit' }
	];

	// Streaming text
	const STREAMING_ANSWER =
		'The invoice failed because the card on file expired on the third, so the retry schedule kept charging a dead account.\n\nI paused it. Update the card and the charge re-runs tonight.';

	// Swipe deck
	type Lead = { id: string; name: string; role: string; note: string };
	const SWIPE_QUEUE: Lead[] = [
		{
			id: 'a',
			name: 'Nadia Roussel',
			role: 'Design engineer',
			note: 'Shipped a design system for a 40-person team.'
		},
		{
			id: 'b',
			name: 'Tobias Lund',
			role: 'Design engineer',
			note: 'Six years of motion work, no production React.'
		},
		{
			id: 'c',
			name: 'Priya Menon',
			role: 'Frontend',
			note: 'Rewrote checkout; 12 percent fewer drop-offs.'
		},
		{
			id: 'd',
			name: 'Elias Kern',
			role: 'Frontend',
			note: 'Portfolio is three unfinished dashboards.'
		}
	];
	let routed = $state<Record<string, SwipeChoice>>({});
	const shortlisted = $derived(Object.values(routed).filter((choice) => choice === 'right').length);

	// Task steps
	const TASK_STEPS = [
		{ id: 'queue', label: 'Queued', meta: '0.2s' },
		{ id: 'build', label: 'Building', meta: '8.1s' },
		{ id: 'test', label: 'Running checks', meta: '3.4s' },
		{ id: 'deploy', label: 'Deploying', meta: '5.0s' }
	];
	let cycle = $state(0);
	$effect(() => {
		const wait = cycle >= TASK_STEPS.length ? 2400 : 1500;
		const t = setTimeout(() => {
			cycle = cycle >= TASK_STEPS.length ? 0 : cycle + 1;
		}, wait);
		return () => clearTimeout(t);
	});

	// Text reveal
	let take = $state(0);

	// Tooltip group
	const TOOLS = [
		{ id: 'bold', glyph: 'B', label: 'Bold', hint: '⌘B' },
		{ id: 'italic', glyph: 'I', label: 'Italic', hint: '⌘I' },
		{ id: 'under', glyph: 'U', label: 'Underline', hint: '⌘U' },
		{ id: 'code', glyph: '{}', label: 'Inline code', hint: '⌘E' },
		{ id: 'link', glyph: '↗', label: 'Insert link', hint: '⌘K' }
	];
	let warm = $state(false);

	// Tree view
	const treeNodes: TreeNode[] = [
		{
			id: 'components',
			label: 'components',
			children: [
				{
					id: 'interior',
					label: 'interior',
					children: [
						{ id: 'tabs', label: 'tabs.tsx', meta: '9 kB' },
						{ id: 'dropdown', label: 'dropdown.tsx', meta: '7 kB' },
						{ id: 'tree-view', label: 'tree-view.tsx', meta: '8 kB' }
					]
				},
				{
					id: 'site',
					label: 'site',
					children: [
						{ id: 'sidebar', label: 'sidebar.tsx', meta: '5 kB' },
						{ id: 'wordmark', label: 'wordmark.tsx', meta: '1 kB' }
					]
				}
			]
		},
		{
			id: 'lib',
			label: 'lib',
			children: [
				{ id: 'registry', label: 'registry.ts', meta: '4 kB' },
				{ id: 'demos-index', label: 'demos/index.tsx', meta: '3 kB' }
			]
		},
		{ id: 'design', label: 'DESIGN.md', meta: '38 kB' }
	];
	let selectedFile = $state<string | null>('tabs');

	// Typing indicator — Nadia and Ravi occasionally type, then send.
	type ChatMessage = { id: number; who: string; text: string };
	type Speaker = 'Nadia' | 'Ravi';
	function isSpeaker(value: string): value is Speaker {
		return value === 'Nadia' || value === 'Ravi';
	}
	const typingSeed: ChatMessage[] = [
		{ id: 1, who: 'Nadia', text: 'Revised floor plan is in the shared folder.' },
		{ id: 2, who: 'You', text: 'No rush — the call moved to Thursday.' }
	];
	const typingLines = {
		Nadia: [
			'The kitchen wall has to come down after all.',
			'Sent the joinery quote too.',
			"Thursday works. I'll bring the samples."
		],
		Ravi: [
			'I can do the site visit Friday morning.',
			'Structural sign-off came through.',
			'Adding the lighting plan tonight.'
		]
	} satisfies Record<Speaker, string[]>;
	/** How long a typing ping lasts before it is considered stale. */
	const TYPING_TIMEOUT = 2400;
	/** Minimum time the row stays up after the last key, so a one-word reply cannot flash. */
	const TYPING_MIN_VISIBLE = 900;
	/** How long the bubble is given to leave as a message. */
	const TYPING_SEND_MS = 340;

	let typists = $state<string[]>([]);
	let sending = $state(false);
	let chatMessages = $state<ChatMessage[]>(typingSeed);
	let chatScroller = $state<HTMLDivElement | null>(null);

	const typingSeen = new SvelteMap<string, number>();
	let typingShownAt = 0;
	let typingSweep: ReturnType<typeof setTimeout> | undefined;
	let typingRelease: ReturnType<typeof setTimeout> | undefined;
	const typingPending = new SvelteSet<ReturnType<typeof setTimeout>>();
	let typingSeq = typingSeed.length;
	const typingTurn = { Nadia: 0, Ravi: 0 } satisfies Record<Speaker, number>;

	onDestroy(() => {
		if (typingSweep) clearTimeout(typingSweep);
		if (typingRelease) clearTimeout(typingRelease);
		typingPending.forEach(clearTimeout);
		typingPending.clear();
	});

	function typingLater(fn: () => void, ms: number) {
		const id = setTimeout(() => {
			typingPending.delete(id);
			fn();
		}, ms);
		typingPending.add(id);
	}

	function typingCommit() {
		const now = Date.now();
		const life = Math.max(200, TYPING_TIMEOUT);

		for (const [name, at] of typingSeen) {
			if (at + life <= now) typingSeen.delete(name);
		}

		let next = Infinity;
		for (const at of typingSeen.values()) next = Math.min(next, at + life);

		let roster2 = Array.from(typingSeen.keys());
		if (roster2.length === 0 && typists.length > 0) {
			const until = typingShownAt + TYPING_MIN_VISIBLE;
			if (until > now) {
				roster2 = typists;
				next = Math.min(next, until);
			}
		}

		const changed =
			roster2.length !== typists.length || roster2.some((name, i) => name !== typists[i]);

		if (changed) {
			if (typists.length === 0) typingShownAt = now;
			typists = roster2;
		}

		if (typingSweep) clearTimeout(typingSweep);
		typingSweep =
			next === Infinity ? undefined : setTimeout(typingCommit, Math.max(24, next - now));
	}

	function typingPing(name: string) {
		if (typingRelease) {
			clearTimeout(typingRelease);
			typingRelease = undefined;
			sending = false;
			typists = [];
			typingShownAt = 0;
		}
		typingSeen.set(name, Date.now());
		typingCommit();
	}

	/** Typing has two endings and both are here: send lifts the bubble away. */
	function typingSend(name: string) {
		if (!typingSeen.has(name) && !typists.includes(name)) return;
		typingSeen.delete(name);
		if (typingSweep) clearTimeout(typingSweep);
		typingSweep = undefined;
		sending = true;

		if (typingRelease) clearTimeout(typingRelease);
		typingRelease = setTimeout(() => {
			typingRelease = undefined;
			sending = false;
			typists = [];
			typingShownAt = 0;
			if (typingSeen.size > 0) typingCommit();
		}, TYPING_SEND_MS);
	}

	function typingTypes(who: string) {
		for (let i = 0; i < 10; i += 1) typingLater(() => typingPing(who), i * 120);
	}

	function typingSends(who: string) {
		if (!isSpeaker(who) || !typists.includes(who)) return;
		typingSend(who);
		const pool = typingLines[who];
		const at = typingTurn[who] % pool.length;
		typingTurn[who] = at + 1;
		const text = pool[at];
		typingLater(() => {
			typingSeq += 1;
			chatMessages = [...chatMessages.slice(-11), { id: typingSeq, who, text }];
		}, TYPING_SEND_MS);
	}

	$effect(() => {
		void chatMessages.length;
		void typists.length;
		const el = chatScroller;
		if (el) el.scrollTop = el.scrollHeight;
	});

	// The card grid never gets a click, so the thread carries on by itself.
	$effect(() => {
		const names = ['Nadia', 'Ravi'];
		let beat = 0;
		const loop = setInterval(() => {
			const who = names[beat % names.length];
			if (typists.includes(who)) typingSends(who);
			else typingTypes(who);
			beat += 1;
		}, 2600);
		return () => clearInterval(loop);
	});

	// Value flash
	const VALUE_STEPS = [-120, -17, 25, 140];
	let requestsPerSecond = $state(1284);
	function nudgeRequests(step: number) {
		requestsPerSecond = Math.min(9600, Math.max(1002, requestsPerSecond + step));
	}

	// Wizard steps — a three-step setup flow with a rich panel per step.
	const wizardSteps: WizardStep[] = [
		{ id: 'plan', label: 'Choose a plan' },
		{ id: 'billing', label: 'Billing details' },
		{ id: 'review', label: 'Review' }
	];
	const wizardRows = {
		plan: [
			['Starter', '3 seats'],
			['Team', '12 seats'],
			['Scale', 'unlimited']
		],
		billing: [
			['Card', '•••• 4242'],
			['Invoice email', 'billing@acme.co'],
			['VAT number', 'Not set']
		],
		review: [
			['Team', '12 seats'],
			['Billed', 'yearly'],
			['Charged to', '•••• 4242']
		]
	} satisfies Record<'plan' | 'billing' | 'review', [string, string][]>;
	function wizardRowsFor(id: string): [string, string][] {
		return id === 'plan' || id === 'billing' || id === 'review' ? wizardRows[id] : [];
	}
	let wizardIndex = $state(0);
	let wizardDone = $state(false);
</script>

<svelte:head>
	<title>Components</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Components</h1>
		<p class="text-muted-foreground">
			Every component this template ships: the shadcn-svelte primitives in
			<code>src/lib/components/ui/</code> and the motion-aware controls ported from Solid Core's
			<code>interior</code> collection in <code>src/lib/components/enhanced/</code>. Both are plain
			Svelte files in your repo — edit them, don't fight them. Where a job has two takes, they sit
			side by side so you can compare. Reach for <code>ui/</code> first; drop into
			<code>enhanced/</code> only when it has no answer for the job.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Buttons</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Buttons</Card.Title>
				<Card.Description>Every variant and size, one component.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<Button>Default</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="outline">Outline</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="destructive">Destructive</Button>
					<Button variant="link">Link</Button>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button size="sm">Small</Button>
					<Button size="default">Default</Button>
					<Button size="lg">Large</Button>
					<Button size="icon" aria-label="Add"><PlusIcon /></Button>
					<Button disabled>Disabled</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Action buttons (enhanced)</Card.Title>
				<Card.Description>
					<code>LoadingButton</code> owns its own pending/success/error state;
					<code>CopyButton</code> writes to the clipboard and draws its own checkmark.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<LoadingButton
					label="Save profile"
					pendingLabel="Saving…"
					successLabel="Saved"
					onAction={saveProfile}
				/>
				<LoadingButton
					label="Deploy"
					pendingLabel="Deploying…"
					errorLabel="Deploy failed"
					onAction={failToSave}
				/>
				<CopyButton value="sb_publishable_example_key" />
				<CopyButton value="npx shadcn-svelte@latest add button" label="Copy command" />
			</Card.Content>
		</Card.Root>

		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Untitled UI buttons (enhanced)</Card.Title>
				<Card.Description>
					The <a
						href="https://www.untitledui.com/react/components/buttons"
						target="_blank"
						rel="noreferrer">Untitled UI</a
					>
					skin — skeuomorphic edge, faded inner border, offset focus outline — painted from this app's
					tokens onto the same <code>ui/button</code> element. Nine
					<code>color</code>s and five <code>size</code>s, plus <code>loading</code> and leading/trailing
					icon snippets.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<UntitledButton>Primary</UntitledButton>
					<UntitledButton color="secondary">Secondary</UntitledButton>
					<UntitledButton color="tertiary">Tertiary</UntitledButton>
					<UntitledButton color="link-color">Link color</UntitledButton>
					<UntitledButton color="link-gray">Link gray</UntitledButton>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<UntitledButton color="primary-destructive">Delete</UntitledButton>
					<UntitledButton color="secondary-destructive">Delete</UntitledButton>
					<UntitledButton color="tertiary-destructive">Delete</UntitledButton>
					<UntitledButton color="link-destructive">Delete</UntitledButton>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<UntitledButton size="xs">Extra small</UntitledButton>
					<UntitledButton size="sm">Small</UntitledButton>
					<UntitledButton size="md">Medium</UntitledButton>
					<UntitledButton size="lg">Large</UntitledButton>
					<UntitledButton size="xl">Extra large</UntitledButton>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<UntitledButton color="secondary">
						{#snippet iconLeading()}<PlusIcon />{/snippet}
						New deal
					</UntitledButton>
					<UntitledButton color="secondary">
						Continue
						{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
					</UntitledButton>
					<UntitledButton color="secondary" aria-label="Add">
						{#snippet iconLeading()}<PlusIcon />{/snippet}
					</UntitledButton>
					<UntitledButton href="/settings" color="link-color">
						Settings
						{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
					</UntitledButton>
					<UntitledButton disabled>Disabled</UntitledButton>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<UntitledButton loading={untitledLoading} onclick={runUntitledDemo}>
						Save changes
					</UntitledButton>
					<UntitledButton
						color="secondary"
						loading={untitledLoading}
						showTextWhileLoading
						onclick={runUntitledDemo}
					>
						{#snippet iconLeading()}<PlusIcon />{/snippet}
						Save changes
					</UntitledButton>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Text fields</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Form inputs</Card.Title>
				<Card.Description>
					Pair every input with a <code>Label</code> via <code>for</code>/<code>id</code>.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid gap-2">
					<Label for="demo-email">Email</Label>
					<Input id="demo-email" type="email" placeholder="you@example.com" />
				</div>
				<div class="grid gap-2">
					<Label for="demo-message">Message</Label>
					<Textarea id="demo-message" placeholder="Say something nice…" />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Floating label (enhanced)</Card.Title>
				<Card.Description>
					The label lifts into the notch on focus and stays up once there is a value — including a
					value the browser restores.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<FloatingLabelInput
					label="Workspace name"
					bind:value={workspace}
					maxlength={32}
					hint="Shown to everyone you invite."
					required
				/>
				<FloatingLabelInput
					label="URL handle"
					bind:value={handle}
					invalid={handleInvalid}
					hint={handleInvalid ? 'Lower case, digits and hyphens only.' : 'acme-industries'}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Inline validation (enhanced)</Card.Title>
				<Card.Description>
					Waits for the first blur, then settles instantly. A value that becomes correct clears
					immediately; a wrong one waits out the debounce, so it cannot flicker once per keystroke.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<InlineValidation
					label="Work email"
					type="email"
					placeholder="you@example.com"
					bind:value={email}
					validate={validateEmail}
					hint="We only use this for billing receipts."
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>One-time code (enhanced)</Card.Title>
				<Card.Description>
					Paste a full code into any cell and it fills from the first. Try <code>123456</code>;
					anything else is rejected.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<OtpInput
					bind:value={code}
					status={codeStatus}
					onValueChange={() => (codeStatus = 'idle')}
					onComplete={checkCode}
					errorMessage="That code is not right. Check your email."
					successMessage="Code accepted."
					hint="Six digits, from the email we just sent."
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Password strength (enhanced)</Card.Title>
				<Card.Description>
					A meter, not a gate, paired with a plain <code>ui/input</code> which still owns the field. Common
					passwords, four-character repeats and keyboard walks are capped at one segment however many
					rules they satisfy.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="grid gap-2">
					<Label for="demo-password">New password</Label>
					<Input
						id="demo-password"
						type="password"
						autocomplete="new-password"
						bind:value={password}
					/>
				</div>
				<PasswordStrength value={password} />
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Toggles</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Checkbox &amp; switch</Card.Title>
				<Card.Description
					>Binary choices — a checkbox for forms, a switch for settings.</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex items-center gap-2">
					<Checkbox id="demo-terms" bind:checked={acceptTerms} />
					<Label for="demo-terms" class="font-normal">
						Accept terms {acceptTerms ? '✓' : ''}
					</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch id="demo-notifications" bind:checked={notifications} />
					<Label for="demo-notifications" class="font-normal">
						Email notifications {notifications ? 'on' : 'off'}
					</Label>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Pickers &amp; selection</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Select</Card.Title>
				<Card.Description>For short, static lists that don't need search.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid gap-2">
					<Label>Select — {fruit ? `chose ${fruitLabel}` : 'nothing chosen'}</Label>
					<Select.Root type="single" bind:value={fruit}>
						<Select.Trigger class="w-56">{fruitLabel}</Select.Trigger>
						<Select.Content>
							{#each FRUIT_OPTIONS as [value, label] (value)}
								<Select.Item {value} {label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Combobox</Card.Title>
				<Card.Description>
					Reach for this when the list is long enough to search, needs multi-select, or posts in a
					form — <code>name</code> makes it drop into a form action like a native select.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid gap-2">
					<Label>Combobox (single, searchable)</Label>
					<Combobox
						bind:value={role}
						options={optionsFromLabels(ROLE_LABELS)}
						placeholder="Assign a role…"
						searchThreshold={0}
						clearable
						class="w-56"
					/>
				</div>
				<div class="grid gap-2">
					<Label>Combobox (multiple) — {tags.length} selected</Label>
					<Combobox
						multiple
						bind:selected={tags}
						options={tagOptions}
						placeholder="Pick teams…"
						class="w-56"
					/>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Calendar</Card.Title>
				<Card.Description>
					Date selection, on <code>@internationalized/date</code> values rather than strings. Inline
					here; pair it with <code>ui/popover</code> for a date field that collapses to a chip — the scheduling
					modal below does exactly that.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Calendar type="single" bind:value={showcaseDate} class="rounded-md border" />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Command</Card.Title>
				<Card.Description>
					The raw filterable-list primitive <code>Combobox</code> and the ⌘K palette are built on.
					Reach for it directly only when you need a bespoke layout — otherwise use
					<code>Combobox</code>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Command.Root class="w-56 rounded-md border">
					<Command.Input placeholder="Search fruit…" />
					<Command.List>
						<Command.Empty>No fruit found.</Command.Empty>
						<Command.Group heading={commandPick ? `Picked ${commandPick}` : 'Fruit'}>
							{#each COMMAND_FRUITS as fruitName (fruitName)}
								<Command.Item onSelect={() => (commandPick = fruitName)}>
									{fruitName}
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.List>
				</Command.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Segmented control (enhanced)</Card.Title>
				<Card.Description>
					A radiogroup with a sliding thumb, for a handful of mutually-exclusive options. Arrow keys
					move the selection and skip disabled segments. Chose <strong>{range}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<SegmentedControl label="Report range" options={ranges} bind:value={range} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tag input (enhanced)</Card.Title>
				<Card.Description>
					Enter and comma commit, Backspace arms then removes, and a multi-value paste splits on the
					separators. Duplicates and the ceiling are refused with a reason.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<TagInput
					label="Skills"
					bind:value={skills}
					max={6}
					placeholder="Add a skill"
					hint="Enter adds · Backspace removes"
				/>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Badges &amp; avatars</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Badges &amp; Avatars</Card.Title>
				<Card.Description>Status markers, identity, and loading placeholders.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<Badge>Default</Badge>
					<Badge variant="secondary">Secondary</Badge>
					<Badge variant="outline">Outline</Badge>
					<Badge variant="destructive">Destructive</Badge>
				</div>
				<div class="flex items-center gap-3">
					<Avatar.Root>
						<Avatar.Image src="https://github.com/ghost.png" alt="Avatar" />
						<Avatar.Fallback>GH</Avatar.Fallback>
					</Avatar.Root>
					<Avatar.Root>
						<Avatar.Fallback>AB</Avatar.Fallback>
					</Avatar.Root>
					<Skeleton class="size-10 rounded-full" />
					<div class="space-y-2">
						<Skeleton class="h-3 w-32" />
						<Skeleton class="h-3 w-24" />
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Overlays</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Modal</Card.Title>
				<Card.Description>
					The standard dialog frame: a muted tray holding a white card — icon-led title bar with its
					close button, then the body — and a footer on the tray that pairs Cancel (Escape) with the
					primary action (Enter). <code>ui/dialog</code> and <code>ui/card</code>
					underneath, <code>UntitledButton</code>s on top.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Modal.Root bind:open={modalOpen}>
					<Modal.Trigger>
						{#snippet child({ props })}
							<UntitledButton color="secondary" {...props}>
								{#snippet iconLeading()}<MegaphoneIcon />{/snippet}
								Create campaign
							</UntitledButton>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content>
						<form onsubmit={createCampaign}>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><MegaphoneIcon /> Create campaign</Modal.Title>
								</Modal.Header>
								<Modal.Body>
									<div class="grid gap-2">
										<Label for="campaign-name" required>Campaign name</Label>
										<Input
											id="campaign-name"
											name="name"
											placeholder="e.g. April product update"
											autocomplete="off"
											required
											bind:value={campaignName}
										/>
										<p class="text-muted-foreground text-sm">
											Used internally to find this campaign in your list.
										</p>
									</div>
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<Modal.Cancel>Cancel</Modal.Cancel>
								<Modal.Action type="submit">Create campaign</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Modal (multi-field form)</Card.Title>
				<Card.Description>
					The same frame carrying a scheduling form. The two identifying fields are labelled
					<code>Combobox</code>es; everything that qualifies the slot collapses into a row of
					<code>size="sm"</code> chips, with the date chip opening a
					<code>Calendar</code> in a <code>Popover</code>. Notes sit in a headed box whose caption
					is the field's own <code>Label</code>.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Modal.Root bind:open={appointmentModalOpen}>
					<Modal.Trigger>
						{#snippet child({ props })}
							<UntitledButton color="secondary" {...props}>
								{#snippet iconLeading()}<CalendarPlusIcon />{/snippet}
								Schedule appointment
							</UntitledButton>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content class="sm:max-w-2xl">
						<form onsubmit={scheduleAppointment}>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><CalendarPlusIcon /> Schedule dental appointment</Modal.Title>
								</Modal.Header>
								<Modal.Body>
									<div class="grid gap-4 sm:grid-cols-2">
										<div class="grid gap-2">
											<Label for="appointment-patient" required>Patient</Label>
											<Combobox
												id="appointment-patient"
												name="patient"
												bind:value={appointmentPatient}
												options={optionsFromLabels(PATIENT_LABELS)}
												placeholder="Select a patient…"
												searchThreshold={0}
												required
											/>
										</div>
										<div class="grid gap-2">
											<Label for="appointment-provider">Provider</Label>
											<Combobox
												id="appointment-provider"
												name="provider"
												bind:value={appointmentProvider}
												options={optionsFromLabels(PROVIDER_LABELS)}
												placeholder="Select a provider…"
											/>
										</div>
									</div>

									<div class="flex flex-wrap items-center gap-2">
										<Combobox
											name="type"
											size="sm"
											class="w-auto"
											ariaLabel="Appointment type"
											bind:value={appointmentType}
											options={optionsFromLabels(APPOINTMENT_TYPE_LABELS)}
										/>

										<Popover.Root bind:open={appointmentDateOpen}>
											<Popover.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														type="button"
														variant="outline"
														size="sm"
														class="font-medium"
													>
														<CalendarIcon class="text-muted-foreground" />
														{appointmentDateLabel}
													</Button>
												{/snippet}
											</Popover.Trigger>
											<Popover.Content class="w-auto p-0">
												<Calendar
													type="single"
													bind:value={appointmentDate}
													onValueChange={() => (appointmentDateOpen = false)}
												/>
											</Popover.Content>
										</Popover.Root>
										<input type="hidden" name="date" value={appointmentDate?.toString() ?? ''} />

										<Combobox
											name="time"
											size="sm"
											class="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 w-auto"
											ariaLabel="Start time"
											bind:value={appointmentTime}
											options={TIME_SLOTS}
										>
											{#snippet icon()}<ClockIcon />{/snippet}
										</Combobox>

										<Combobox
											name="duration"
											size="sm"
											class="w-auto"
											ariaLabel="Duration"
											bind:value={appointmentDuration}
											options={optionsFromLabels(DURATION_LABELS)}
										/>
									</div>

									<div class="border-input overflow-hidden rounded-lg border">
										<Label
											for="appointment-notes"
											class="bg-muted/50 border-input text-muted-foreground block border-b px-3 py-2 text-[11px] font-semibold tracking-wider uppercase"
										>
											Notes
										</Label>
										<Textarea
											id="appointment-notes"
											name="notes"
											placeholder="Add notes for this appointment…"
											bind:value={appointmentNotes}
											class="min-h-20 resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
										/>
									</div>
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<div class="flex items-center gap-2">
									<Switch id="appointment-create-more" bind:checked={createMoreAppointments} />
									<Label for="appointment-create-more" class="text-muted-foreground font-normal">
										Create more
									</Label>
								</div>
								<Modal.Action type="submit">Create appointment</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Upgrade modal</Card.Title>
				<Card.Description>
					The upgrade pitch as a dialog: a primary-tinted halftone hero, a title with the plan pill
					beside it, what the plan adds, and a full-width action over a quiet way out —
					<code>ui/dialog</code> underneath, <code>UntitledButton</code>s on top. The app mounts one
					in the <code>(app)</code> layout: <code>showUpgrade('deals')</code> from
					<code>$lib/upgrade.svelte</code> opens it with the org's real plans, from anywhere.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<UpgradeModal.Root bind:open={upgradeDemoOpen}>
					<UpgradeModal.Trigger>
						{#snippet child({ props })}
							<UntitledButton color="secondary" {...props}>
								{#snippet iconLeading()}<SparklesIcon />{/snippet}
								Demo copy
							</UntitledButton>
						{/snippet}
					</UpgradeModal.Trigger>
					<UpgradeModal.Content>
						<UpgradeModal.Hero><SparklesIcon /></UpgradeModal.Hero>
						<UpgradeModal.Header>
							<UpgradeModal.Title>Upgrade your plan</UpgradeModal.Title>
							<UpgradeModal.Badge>Pro</UpgradeModal.Badge>
							<UpgradeModal.Description>
								Get the pipeline view, the reports that go with it, and a named contact when you
								need one.
							</UpgradeModal.Description>
						</UpgradeModal.Header>
						<UpgradeModal.Features>
							{#each UPGRADE_PERKS as perk (perk.name)}
								<UpgradeModal.Feature>
									<UpgradeModal.FeatureTitle>{perk.name}</UpgradeModal.FeatureTitle>
									<UpgradeModal.FeatureDescription
										>{perk.description}</UpgradeModal.FeatureDescription
									>
								</UpgradeModal.Feature>
							{/each}
						</UpgradeModal.Features>
						<UpgradeModal.Footer>
							<UpgradeModal.Action onclick={requestUpgradeDemo}>Upgrade to Pro</UpgradeModal.Action>
							<UpgradeModal.Dismiss>No thanks</UpgradeModal.Dismiss>
						</UpgradeModal.Footer>
						<UpgradeModal.Close />
					</UpgradeModal.Content>
				</UpgradeModal.Root>
				<UntitledButton color="secondary" onclick={() => showUpgrade()}
					>showUpgrade()</UntitledButton
				>
				<UntitledButton color="secondary" onclick={() => showUpgrade('deals')}>
					showUpgrade('deals')
				</UntitledButton>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Dialog, menu &amp; tooltip</Card.Title>
				<Card.Description>A blocking modal, a floating menu, and a hover hint.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Dialog.Root bind:open={dialogOpen}>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Open dialog</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>A modal dialog</Dialog.Title>
							<Dialog.Description>
								Focus is trapped, Escape closes it, and the page behind is inert.
							</Dialog.Description>
						</Dialog.Header>
						<Dialog.Footer>
							<Button onclick={() => (dialogOpen = false)}>Done</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								Menu <ChevronDownIcon class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start">
						<DropdownMenu.Label>Actions</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
						<DropdownMenu.Item>Archive</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item variant="destructive">Delete</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" {...props}>Hover me</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>A helpful hint.</Tooltip.Content>
				</Tooltip.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Popover &amp; sheet</Card.Title>
				<Card.Description>
					A floating panel anchored to its trigger, and a panel that slides in from the edge of the
					screen — the sidebar uses <code>Sheet</code> for its mobile nav.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Popover.Root bind:open={popoverOpen}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Open popover</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="space-y-2">
						<p class="text-sm font-medium">Anchored content</p>
						<p class="text-muted-foreground text-sm">
							Positioned relative to its trigger, flips to stay on screen.
						</p>
					</Popover.Content>
				</Popover.Root>

				<Sheet.Root bind:open={sheetOpen}>
					<Sheet.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Open sheet</Button>
						{/snippet}
					</Sheet.Trigger>
					<Sheet.Content>
						<Sheet.Header>
							<Sheet.Title>A side sheet</Sheet.Title>
							<Sheet.Description
								>Slides in from the edge; same overlay/focus trap as Dialog.</Sheet.Description
							>
						</Sheet.Header>
						<Sheet.Footer>
							<Button onclick={() => (sheetOpen = false)}>Done</Button>
						</Sheet.Footer>
					</Sheet.Content>
				</Sheet.Root>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Tabs</h2>
		</div>

		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Tabs</Card.Title>
				<Card.Description>Switch between related views without navigation.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Tabs.Root value="overview">
					<Tabs.List>
						<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
						<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
						<Tabs.Trigger value="danger">Danger zone</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="overview" class="text-muted-foreground pt-3 text-sm">
						The calm before the storm. Nothing to see here.
					</Tabs.Content>
					<Tabs.Content value="activity" class="text-muted-foreground pt-3 text-sm">
						You deployed to production on a Friday. Bold.
					</Tabs.Content>
					<Tabs.Content value="danger" class="text-muted-foreground pt-3 text-sm">
						Buttons in here should be <Badge variant="destructive">destructive</Badge> and confirmed with
						a dialog.
					</Tabs.Content>
				</Tabs.Root>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Alerts &amp; toasts</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Alerts</Card.Title>
				<Card.Description>
					Inline messages. Validation failures render through <code>FormAlert</code> — one line per form,
					nothing hand-rolled.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<Alert.Root>
					<InfoIcon />
					<Alert.Title>Heads up</Alert.Title>
					<Alert.Description>Neutral context that isn't tied to a submission.</Alert.Description>
				</Alert.Root>
				<Alert.Root variant="destructive">
					<CircleAlertIcon />
					<Alert.Title>Couldn't save</Alert.Title>
					<Alert.Description>Check the highlighted fields and try again.</Alert.Description>
				</Alert.Root>
				<Alert.Root variant="success">
					<CircleCheckIcon />
					<Alert.Title>Password updated</Alert.Title>
					<Alert.Description>Sign in with your new password.</Alert.Description>
				</Alert.Root>
				<Alert.FormAlert class="mb-0" message="Display name must be 100 characters or fewer." />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Toasts</Card.Title>
				<Card.Description>
					svelte-sonner via <code>ui/sonner</code>. House convention: successes toast, validation
					errors render inline next to the form.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-2">
				<Button variant="outline" onclick={() => toast('A plain message')}>Default</Button>
				<Button variant="outline" onclick={() => toast.success('Changes saved')}>Success</Button>
				<Button variant="outline" onclick={() => toast.error('Something went wrong')}>Error</Button>
				<Button
					variant="outline"
					onclick={() =>
						toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
							loading: 'Saving…',
							success: 'Done',
							error: 'Failed'
						})}
				>
					Promise
				</Button>
			</Card.Content>
		</Card.Root>

		<div class="lg:col-span-2">
			<h2 class="text-lg font-semibold tracking-tight">Enhanced primitives</h2>
			<p class="text-muted-foreground text-sm">
				Every other <code>enhanced/</code> control that has no direct <code>ui/</code> counterpart to
				sit beside.
			</p>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Accordion</Card.Title>
				<Card.Description>
					Single-open by default. Arrow keys, Home and End move focus between headers, and a rich
					panel snippet renders markup instead of plain text.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Accordion items={accordionItems} defaultOpen={['shipping']} class="w-full">
					{#snippet panel(item)}
						{#if item.id === 'shipping'}
							<p>
								Standard delivery lands in two to four working days. Orders placed before 2pm local
								time leave the warehouse the same day.
							</p>
						{:else if item.id === 'returns'}
							<p>Send anything back unworn within 30 days.</p>
						{:else}
							<ul class="space-y-1 tabular-nums">
								{#each accordionSizes as size (size)}
									<li>{size}</li>
								{/each}
							</ul>
						{/if}
					{/snippet}
				</Accordion>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Blur-up image</Card.Title>
				<Card.Description>
					Sharpens from a blurred placeholder once the photo decodes. A cached image reveals
					instantly; a broken URL shows the fallback glyph instead.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<BlurUpImage
					src={blurSrc}
					alt="A photograph swapped between cards to demonstrate the develop effect"
					width={320}
					height={200}
					placeholder={BLUR_LQIP}
					color="#8e977f"
					class="mx-auto max-w-[320px]"
				/>
				<div class="flex justify-center gap-2">
					<Button variant="outline" size="sm" onclick={() => (blurSrc = BLUR_PHOTO_A)}
						>Photo A</Button
					>
					<Button variant="outline" size="sm" onclick={() => (blurSrc = BLUR_PHOTO_B)}
						>Photo B</Button
					>
					<Button variant="outline" size="sm" onclick={() => (blurSrc = BLUR_DEAD)}>
						Broken URL
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Collapsible banner</Card.Title>
				<Card.Description>
					Folds instead of vanishing — the title stays put while the body slides underneath it.
					Dismissal collapses the outer frame so it leaves no gap.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-2">
				<CollapsibleBanner
					title="Payments are degraded"
					description="Charges are queued and settle automatically once the provider recovers. Nothing is lost."
					dismissible={false}
				/>
				<CollapsibleBanner
					title="Storage is nearly full"
					description="This workspace is using 94% of its 10 GB."
					dismissLabel="Dismiss storage notice"
				>
					{#snippet action()}
						<Button variant="secondary" size="sm">Upgrade plan</Button>
					{/snippet}
				</CollapsibleBanner>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Context menu</Card.Title>
				<Card.Description>
					Right-click a row, or press Shift + F10. Placement flips near a viewport edge, and typing
					jumps to the matching item.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if visibleFiles.length > 0}
					<ul class="space-y-1">
						{#each visibleFiles as file (file.id)}
							<li>
								<ContextMenu
									label={`Actions for ${file.name}`}
									items={fileMenuItems(file.id)}
									class="bg-muted/50 flex h-[50px] items-center rounded-[9px] px-3"
								>
									<span class="min-w-0 flex-1">
										<span class="text-foreground block truncate text-[12.5px] font-medium">
											{file.name}
										</span>
										<span class="text-muted-foreground mt-[1px] block text-[11px]">{file.meta}</span
										>
									</span>
								</ContextMenu>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="grid h-[158px] place-items-center">
						<Button variant="outline" onclick={() => (trashed = [])}>Put them back</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Expanding search</Card.Title>
				<Card.Description>
					Reserves its expanded width up front so the row beside it never reflows. Escape clears the
					query first, then collapses.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex items-center gap-3">
					<h3 class="text-foreground text-[13px] font-medium">Interactions</h3>
					<div class="ml-auto w-full max-w-[240px]">
						<ExpandingSearch
							bind:value={searchQuery}
							label="Search interactions"
							resultCount={searchResults.length}
							onSearch={(next) => (settledQuery = next)}
						/>
					</div>
				</div>
				<ul class="mt-3 space-y-1">
					{#each searchResults.slice(0, 4) as item (item)}
						<li class="bg-muted/50 text-foreground rounded-[7px] px-2.5 py-1.5 text-[12.5px]">
							{item}
						</li>
					{/each}
					{#if searchResults.length === 0}
						<li class="text-muted-foreground px-2.5 py-1.5 text-[12.5px]">No matches</li>
					{/if}
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Filter grid</Card.Title>
				<Card.Description>
					A radiogroup with a sliding thumb over a fixed-height card grid. Surviving cards animate
					to their new slot instead of the grid jumping. Showing <strong>{assetFilter}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<FilterGrid
					label="Asset type"
					items={assets}
					filters={assetFilters}
					getKey={(a) => a.id}
					bind:value={assetFilter}
					rowHeight={64}
					maxRows={3}
				>
					{#snippet item(asset)}
						<div class="flex h-full flex-col justify-between">
							<p class="text-foreground truncate text-[12.5px] font-medium">{asset.name}</p>
							<p class="text-muted-foreground text-[10.5px] tabular-nums">{asset.size}</p>
						</div>
					{/snippet}
				</FilterGrid>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Hide on scroll</Card.Title>
				<Card.Description>
					The bar yields to a sustained scroll down and returns on a shorter scroll up, so a
					two-pixel trackpad wobble can't flap it open and shut.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="mx-auto w-full max-w-[440px]">
					<HideOnScroll maxHeight={232} label="Longitude">
						{#snippet bar()}
							<span class="text-foreground min-w-0 flex-1 truncate text-[13px] font-medium">
								Longitude
							</span>
							<button
								type="button"
								aria-pressed={bookmarked}
								aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
								onclick={() => (bookmarked = !bookmarked)}
								class={cn(
									'border-border bg-card hover:bg-muted focus-visible:ring-ring flex size-7 cursor-pointer items-center justify-center rounded-[6px] border transition-colors duration-150 outline-none focus-visible:ring-1',
									bookmarked ? 'text-foreground' : 'text-muted-foreground'
								)}
							>
								<svg width="15" height="15" viewBox="0 0 256 256" aria-hidden="true">
									<path
										d={HIDE_ON_SCROLL_BOOKMARK}
										fill={bookmarked ? 'currentColor' : 'none'}
										stroke="currentColor"
										stroke-width="16"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
						{/snippet}

						<div class="space-y-3 px-3.5 pt-1 pb-4">
							{#each HIDE_ON_SCROLL_ARTICLE as line (line)}
								<p class="text-muted-foreground text-[13px] leading-relaxed">{line}</p>
							{/each}
						</div>
					</HideOnScroll>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Hold to confirm</Card.Title>
				<Card.Description>
					A press-and-hold sweep instead of a click — releasing early cancels and nothing happens.
					Escape unwinds it mid-hold.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex justify-center">
				<HoldToConfirm confirmLabel="Workspace deleted" duration={1800} onConfirm={() => {}}>
					Hold to delete workspace
				</HoldToConfirm>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Icon morph</Card.Title>
				<Card.Description>
					Every state's paths share one command signature, so Motion interpolates the icon itself
					instead of crossfading two separate glyphs.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center justify-center gap-3">
				{#each ICON_MORPH_ROW as entry (entry.preset)}
					<IconMorph preset={entry.preset} semantics={entry.semantics} />
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Lightbox</Card.Title>
				<Card.Description>
					Opens by flying from the thumbnail's own rect. Scroll or pinch to zoom toward the pointer,
					drag to pan, and double-click to toggle — Escape unwinds the zoom before it closes.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="mx-auto grid w-full max-w-[420px] grid-cols-2 gap-3">
					{#each LIGHTBOX_SHOTS as shot (shot.id)}
						<figure class="min-w-0">
							<button
								type="button"
								aria-label="Open {shot.title}"
								onclick={(event) => showShot(shot, event)}
								class="group border-border block w-full cursor-zoom-in overflow-hidden rounded-[9px] border outline-none focus-visible:shadow-[0_0_0_1.5px_var(--ring)]"
							>
								<img
									src={shot.src}
									alt={shot.alt}
									width={shot.w}
									height={shot.h}
									draggable="false"
									class="block aspect-[3/2] w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
								/>
							</button>
							<figcaption class="mt-1.5 flex items-baseline justify-between gap-2">
								<span class="text-muted-foreground truncate text-[11.5px]">{shot.title}</span>
								<span class="text-muted-foreground/70 font-mono text-[9.5px] tabular-nums">
									{shot.w} × {shot.h}
								</span>
							</figcaption>
						</figure>
					{/each}
				</div>

				<Lightbox
					bind:open={lightboxOpen}
					origin={lightboxOrigin}
					src={activeShot.src}
					alt={activeShot.alt}
					caption={activeShot.title}
					width={activeShot.w}
					height={activeShot.h}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Like burst</Card.Title>
				<Card.Description>
					Optimistic and debounced — a burst of taps settles to one committed intent, and the spark
					burst plays only on the way to liked.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex justify-center">
				<LikeBurst
					bind:this={likeBurstControl}
					initialCount={128}
					onToggle={(next) => (liked = next)}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Live activity</Card.Title>
				<Card.Description>
					A pod that peeks on every phase change and folds back to a glyph. Failure holds it open
					with a Retry.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div
					class="border-border bg-background relative h-64 w-full max-w-[420px] overflow-hidden rounded-[12px] border"
				>
					<div class="pointer-events-none absolute inset-x-0 top-4 z-10">
						<LiveActivity {activity} onDismiss={dismissActivity} />
					</div>

					<div aria-hidden="true" class="space-y-4 px-6 pt-20">
						{#each LIVE_ACTIVITY_LINES as width (width)}
							<div class={cn('bg-foreground/[0.06] h-2.5 rounded-[2px]', width)}></div>
						{/each}
					</div>

					<div class="absolute right-4 bottom-4">
						<Button variant="outline" size="sm" onclick={deploy}>Deploy</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Load more</Card.Title>
				<Card.Description>
					A sentinel loads the next page automatically as it nears the viewport; the button still
					works for a manual retry after an error.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div
					bind:this={feedScroller}
					class="border-border bg-muted/40 h-56 w-full overflow-y-auto overscroll-contain rounded-[12px] border p-3"
				>
					<ul class="space-y-1">
						{#each Array.from({ length: feedCount }, (_, i) => i) as i (i)}
							<li
								class="border-border bg-card text-foreground rounded-[9px] border px-3 py-2.5 text-[12.5px] shadow-xs"
							>
								Item {String(i + 1).padStart(2, '0')}
							</li>
						{/each}
					</ul>
					<div class="pt-3">
						<LoadMore
							onLoad={loadFeed}
							hasMore={feedCount < TOTAL}
							root={feedScroller}
							rootMargin="120px 0px"
							maxAutoLoads={2}
						/>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Logo marquee</Card.Title>
				<Card.Description>
					An infinite strip that drifts at a constant rate and pauses under the pointer or focus.
					Reduced motion shows a single static row instead.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<LogoMarquee items={marqueeItems} label="Customers">
					{#snippet mark(item)}
						<span class="flex items-center gap-2">
							<svg
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d={marqueePaths.get(item.id) ?? ''} />
							</svg>
							{item.label}
						</span>
					{/snippet}
				</LogoMarquee>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Long press</Card.Title>
				<Card.Description>
					The label fills as the hold accrues and only fires once the press survives the full
					duration — a drift, release or blur cancels it instead.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex justify-center">
					<LongPressButton onLongPress={() => (archived = !archived)}>
						{archived ? 'Hold to restore' : 'Hold to archive'}
					</LongPressButton>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>New items pill</Card.Title>
				<Card.Description>
					Scroll away from the top — arrivals pile up behind a pill instead of yanking your reading
					position. Scrolling back to the edge yourself clears it just as well.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div
					class="border-border bg-background relative h-64 w-full overflow-hidden rounded-[12px] border"
				>
					<div
						bind:this={activityScroller}
						role="region"
						aria-label="Team activity"
						class="h-full overflow-y-auto overscroll-contain px-3 py-3 outline-none"
					>
						{#each activityIds as id (id)}
							<article class="rounded-[8px] px-2.5 py-[9px] text-[12.5px] leading-relaxed">
								<span class="text-foreground font-medium"
									>{activityWho[id % activityWho.length]}</span
								>
								<span class="text-muted-foreground">{activityWhat[id % activityWhat.length]}</span>
							</article>
						{/each}
					</div>
					<NewItemsPill scroller={activityScroller} itemCount={activityIds.length} class="px-3" />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Pagination</Card.Title>
				<Card.Description>
					A sliding thumb tracks the current page; the window collapses into an ellipsis once there
					are too many pages to show. On page <strong>{resultsPage}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex justify-center">
				<Pagination count={24} bind:page={resultsPage} label="Search results" />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Poll results</Card.Title>
				<Card.Description>
					One vote per person — the bars fill and the winner's tick lands only after a choice is
					made.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<PollResults label="Floor for the front room?" options={pollOptions} onVote={castVote} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Presence avatars</Card.Title>
				<Card.Description>
					A stack that fills and empties in first-seen order, with an overflow chip past the third
					slot and a live region announcing who is here.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col items-center gap-4">
				<PresenceAvatars {people} max={3} size={36} label="On this board" />
				<div class="flex items-center gap-2">
					<Button type="button" variant="outline" size="sm" onclick={join}>Someone joins</Button>
					<Button type="button" variant="outline" size="sm" onclick={leave}>
						Longest here leaves
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Press depth</Card.Title>
				<Card.Description>
					Drops into its own well on press and leans toward the corner the pointer landed on. The
					same key press from the keyboard, without the tilt.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex justify-center">
				<PressDepth>Press me</PressDepth>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Progress bar</Card.Title>
				<Card.Description>
					Runs an indeterminate sweep while the total is unknown, then springs to a measured
					fraction once it is.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ProgressBar
					value={uploadValue}
					label="roadmap.pdf"
					pendingLabel="Sizing"
					completeLabel="Upload complete"
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Reading progress</Card.Title>
				<Card.Description>
					Tracks scroll inside a single coalesced frame and reports minutes left against a word
					count, handing over to a drawn checkmark at the end.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-2">
				<ReadingProgress scroller={readingScroller} words={readingWords} />
				<div
					bind:this={readingScroller}
					role="region"
					aria-label="Article body"
					tabindex="-1"
					class="bg-muted/50 text-muted-foreground max-h-[160px] space-y-3 overflow-y-auto overscroll-contain rounded-[9px] p-3 text-[12.5px] leading-relaxed outline-none"
				>
					{#each readingParagraphs as paragraph (paragraph)}
						<p>{paragraph}</p>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Reorder list</Card.Title>
				<Card.Description>
					Drag a row, or grab it with Space and move it with the arrow keys; Escape puts the
					original order back.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ReorderList
					items={agendaRows}
					getId={(row) => row.id}
					getLabel={(row) => row.title}
					onReorder={handleReorder}
					label="Meeting agenda"
				>
					{#snippet children(row)}
						<div class="flex items-baseline justify-between gap-3">
							<p class="text-foreground truncate text-[13px] font-medium">{row.title}</p>
							<p class="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">
								{row.length}
							</p>
						</div>
					{/snippet}
				</ReorderList>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Ripple</Card.Title>
				<Card.Description>
					Blooms from wherever the pointer lands, or from centre on a keyboard press, and tracks
					every simultaneous touch up to its ceiling.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex justify-center">
				<Ripple class="h-11 px-6">Tap anywhere on me</Ripple>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Scroll spy</Card.Title>
				<Card.Description>
					A sliding nav thumb that tracks whichever section sits under the reading line inside the
					box below. Click a chip to smooth-scroll straight to it.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ScrollSpy sections={scrollSections} root={scrollBox} offset={14} class="mb-3" />
				<div
					bind:this={scrollBox}
					class="bg-muted/50 h-[160px] overflow-y-auto overscroll-contain rounded-[11px] px-3.5 py-3"
				>
					<section class="pb-5">
						<h3 id="scrollspy-overview" class="text-foreground text-[13px] font-medium">
							Overview
						</h3>
						<p class="text-muted-foreground mt-1.5 text-[12.5px]">
							A workspace holds every project your team ships, with one billing plan and one set of
							members across all of them.
						</p>
					</section>
					<section class="pb-5">
						<h3 id="scrollspy-pricing" class="text-foreground text-[13px] font-medium">Pricing</h3>
						<p class="text-muted-foreground mt-1.5 text-[12.5px]">
							Seats are billed monthly per active member. Projects, storage and build minutes are
							unmetered on every plan.
						</p>
					</section>
					<section class="pb-5 last:pb-0">
						<h3 id="scrollspy-limits" class="text-foreground text-[13px] font-medium">Limits</h3>
						<p class="text-muted-foreground mt-1.5 text-[12.5px]">
							Free workspaces cap out at three projects. Upgrading lifts the cap immediately, with
							no migration step.
						</p>
					</section>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Show more</Card.Title>
				<Card.Description>
					Clamps to a measured pixel height rather than line-clamp, so the collapsed and expanded
					text break in exactly the same places.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ShowMore lines={3} maxHeight={168} label="Release notes">
					<p>
						The scheduler no longer re-queues a job that was cancelled while its retry timer was
						still pending, which is what caused duplicate webhooks on slow upstreams. Idempotency
						keys are now written before the first attempt rather than after it, so a crash between
						the two no longer produces a second delivery. Retention for delivery logs moved from
						seven days to thirty. The dashboard reads them from a partitioned table, so the range
						picker stays fast past a million rows. Two deprecated fields on the event payload were
						removed after a full release of warnings.
					</p>
				</ShowMore>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Skeleton swap</Card.Title>
				<Card.Description>
					Holds the box at a fixed height and crossfades between a placeholder and the real content
					— it can never blink in before <code>delay</code> or out before <code>minVisible</code>.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex justify-center">
				<SkeletonSwap
					ready={profileReady}
					lines={3}
					lineHeight={21}
					label="Profile"
					class="w-full max-w-[360px]"
				>
					{#if profileReady}
						<p class="text-muted-foreground text-[13.5px] leading-[21px]">
							Ships the last twenty percent. Writes about the half-second after a click, and about
							the three things that always go missing before a component is actually done.
						</p>
					{/if}
				</SkeletonSwap>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Slider detents</Card.Title>
				<Card.Description>
					A free-moving slider with named stops it snaps to within a capture radius. Chose
					<strong>{formatSpeed(playbackSpeed)}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<SliderDetents
					label="Playback speed"
					bind:value={playbackSpeed}
					min={0.25}
					max={2}
					step={0.05}
					pull={0.08}
					detents={speedDetents}
					format={formatSpeed}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Snap carousel</Card.Title>
				<Card.Description>
					Drag or flick between slides, or use the dots and arrow keys. A flick projects its release
					velocity forward to pick the landing slide.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<SnapCarousel items={rooms} getKey={(room) => room.id} label="Rooms" peek={32} gap={10}>
					{#snippet slide(room: Room, i: number)}
						<figure class="border-border bg-card rounded-[11px] border p-[5px] shadow-xs">
							<div class="relative">
								<img
									src={room.image}
									alt=""
									class="h-[104px] w-full rounded-[9px] object-cover"
									loading="lazy"
								/>
								<span
									class="bg-background/80 text-muted-foreground absolute right-2 bottom-2 rounded-[4px] px-1 font-mono text-[9.5px] tabular-nums"
								>
									{String(i + 1).padStart(2, '0')} · {String(rooms.length).padStart(2, '0')}
								</span>
							</div>
							<figcaption class="px-1 pt-2 pb-1">
								<p class="text-foreground text-[13px] font-medium">{room.name}</p>
								<p class="text-muted-foreground text-[11.5px]">{room.line}</p>
							</figcaption>
						</figure>
					{/snippet}
				</SnapCarousel>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Sortable table</Card.Title>
				<Card.Description>
					Click a header to sort, click again to reverse, a third click restores the original order.
					Rows travel to their new rank by transform, so the table's height never changes mid-sort.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<SortableTable
					label="Reviewers"
					rows={reviewers}
					columns={reviewerColumns}
					getRowId={(r) => r.id}
					getRowLabel={(r) => r.name}
					markable
					rowHeight={40}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Sticky header</Card.Title>
				<Card.Description>
					Scroll the list and the title condenses into a compact bar riding a spring, so it keeps
					travelling for a beat after the scroll itself stops.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<StickyHeader title="Inbox" subtitle={`${stickyMessages.length} messages`} maxHeight={224}>
					<ul class="px-2 pb-2">
						{#each stickyMessages as message (message.id)}
							<li class="min-w-0 px-2 py-2">
								<span class="text-foreground block truncate text-[13px] font-medium"
									>{message.from}</span
								>
								<span class="text-muted-foreground block truncate text-[11.5px]"
									>{message.line}</span
								>
							</li>
						{/each}
					</ul>
				</StickyHeader>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Streaming text</Card.Title>
				<Card.Description>
					Paces a full response into view token by token, with a blinking caret and a Skip / Replay
					affordance once it lands.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<StreamingText text={STREAMING_ANSWER} tokensPerSecond={9} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Swipe deck</Card.Title>
				<Card.Description>
					Drag, flick or use the arrow keys to decide the top card; Backspace (or the Undo button)
					brings the last decision back. Shortlisted <strong>{shortlisted}</strong> so far.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="mx-auto w-full max-w-[360px]">
					<SwipeDeck
						items={SWIPE_QUEUE}
						itemKey={(lead) => lead.id}
						itemLabel={(lead) => `${lead.name}, ${lead.role}`}
						label="Applicant queue"
						leftLabel="Pass"
						rightLabel="Shortlist"
						height={152}
						emptyLabel="Queue cleared"
						onDecide={(lead, choice) => (routed = { ...routed, [lead.id]: choice })}
						onUndo={(lead) => {
							const next = { ...routed };
							delete next[lead.id];
							routed = next;
						}}
					>
						{#snippet card(lead: Lead)}
							<div class="flex h-full flex-col justify-end gap-1 p-3.5">
								<p class="text-foreground text-[13px] font-medium">{lead.name}</p>
								<p class="text-muted-foreground text-[12px] leading-relaxed">{lead.note}</p>
								<p class="text-muted-foreground/80 text-[11.5px]">{lead.role}</p>
							</div>
						{/snippet}
					</SwipeDeck>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Task steps</Card.Title>
				<Card.Description>
					A running plan: done steps get a check, the active one spins and shimmers, and each row's
					duration fades in once it lands.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<TaskSteps steps={TASK_STEPS} current={cycle} label="Deploy progress" />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Text reveal</Card.Title>
				<Card.Description>
					Each word sweeps in from a blur on its own delay. Click Reveal to play it again.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#key take}
					<TextReveal
						text="Nobody is given a week to write these, so they ship at eighty percent and stay there for the life of the product."
						startOnView={false}
						class="text-muted-foreground block text-[13.5px] leading-relaxed"
					/>
				{/key}
				<Button variant="outline" size="sm" class="mt-4" onclick={() => (take += 1)}>Reveal</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tooltip group</Card.Title>
				<Card.Description>
					One shared seat for every tooltip in the toolbar: the first hover pays the open delay,
					then the rest arrive on contact while the group stays warm{warm ? ' — warm now' : ''}.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<TooltipGroup class="flex items-center gap-1" onWarmChange={(next) => (warm = next)}>
					{#each TOOLS as tool (tool.id)}
						<EnhancedTooltip>
							{#snippet label()}
								<span class="flex items-center gap-2">
									{tool.label}
									<span class="font-mono text-[9.5px] opacity-60">{tool.hint}</span>
								</span>
							{/snippet}

							{#snippet children(describedBy)}
								<Button
									variant="outline"
									aria-label={tool.label}
									aria-describedby={describedBy}
									class="text-muted-foreground h-9 w-10 font-mono text-[12.5px]"
								>
									{tool.glyph}
								</Button>
							{/snippet}
						</EnhancedTooltip>
					{/each}
				</TooltipGroup>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tree view</Card.Title>
				<Card.Description>
					Arrow keys move through the rows; Right expands a folder or steps into it, Left collapses
					it or climbs to the parent. Selected <strong>{selectedFile}</strong>.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<TreeView
					nodes={treeNodes}
					label="Project files"
					defaultExpanded={['components', 'interior']}
					bind:selected={selectedFile}
					class="mx-auto w-full max-w-[300px]"
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Typing indicator</Card.Title>
				<Card.Description>
					The bubble arrives on the first keystroke and lifts away as a sent message rather than
					collapsing. Nadia and Ravi type on their own — or nudge them below.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div
					class="border-border bg-background mx-auto flex h-64 w-full max-w-[420px] flex-col overflow-hidden rounded-[12px] border"
				>
					<div
						bind:this={chatScroller}
						class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-1"
					>
						<div class="flex flex-col gap-1.5">
							{#each chatMessages as message (message.id)}
								<div
									class={cn(
										'max-w-[76%] rounded-[14px] px-3 py-2 text-[12.5px] leading-snug',
										message.who === 'You'
											? 'bg-primary text-primary-foreground self-end'
											: 'bg-muted text-foreground self-start'
									)}
								>
									{message.text}
								</div>
							{/each}

							<div class="self-start">
								<TypingIndicator {typists} {sending} size={30} showLabel={false} />
							</div>
						</div>
					</div>

					<div class="border-border flex shrink-0 items-center gap-1.5 border-t px-4 py-3">
						<Button variant="outline" size="sm" onclick={() => typingTypes('Nadia')}>
							Nadia types
						</Button>
						<Button variant="outline" size="sm" onclick={() => typingTypes('Ravi')}
							>Ravi types</Button
						>
						<Button
							variant="outline"
							size="sm"
							class="ml-auto"
							onclick={() => typingSends(typists[0] ?? '')}
						>
							Sends it
						</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Value flash</Card.Title>
				<Card.Description>
					A change of identity, not of render, is what marks it — the figure rolls in from the
					direction it moved and tints green or red while it holds.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col items-center gap-5">
				<ValueFlash
					value={requestsPerSecond}
					format={(n) => n.toLocaleString('en-US')}
					label="Requests per second"
					class="text-[24px]"
				/>
				<div class="flex gap-1.5">
					{#each VALUE_STEPS as step (step)}
						<Button variant="outline" size="sm" onclick={() => nudgeRequests(step)}>
							{step > 0 ? '+' : '−'}{Math.abs(step).toLocaleString('en-US')}
						</Button>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Wizard steps</Card.Title>
				<Card.Description>
					Step tiles double as a nav — click any tile you have already reached, or use the arrow
					keys. The panel crossfades in the direction of travel.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<WizardSteps
					steps={wizardSteps}
					bind:index={wizardIndex}
					complete={wizardDone}
					height={140}
					label="Workspace setup"
					onIndexChange={() => (wizardDone = false)}
					onComplete={() => (wizardDone = true)}
					class="mx-auto w-full max-w-[420px]"
				>
					{#snippet step(entry)}
						<ul class="space-y-1">
							{#each wizardRowsFor(entry.id) as [name, value] (name)}
								<li
									class="bg-muted/60 flex items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-[12.5px]"
								>
									<span class="text-foreground">{name}</span>
									<span class="text-muted-foreground">{value}</span>
								</li>
							{/each}
						</ul>
					{/snippet}
				</WizardSteps>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Table</Card.Title>
			<Card.Description>
				The bare table primitives, for static rows. Once a grid needs sorting, filtering or
				pagination, reach for the <code>DataTable</code> compound below instead of wiring these by hand.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28">Invoice</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Method</Table.Head>
						<Table.Head class="text-right">Amount</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each invoices as invoice (invoice.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{invoice.id}</Table.Cell>
							<Table.Cell>
								<Badge variant={invoice.status === 'Paid' ? 'secondary' : 'outline'}>
									{invoice.status}
								</Badge>
							</Table.Cell>
							<Table.Cell>{invoice.method}</Table.Cell>
							<Table.Cell class="text-right">{invoice.amount}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Data table</Card.Title>
			<Card.Description>
				The <code>DataTable</code> compound in <code>src/lib/components/data-table/</code>, built on
				<code>@tanstack/svelte-table</code> and the table primitives above. The page owns the rows,
				builds its columns with <code>createColumnHelper</code> and creates the table with
				<code>createTable</code> against the shared <code>DataTable.features</code> preset; the
				parts render it. The toolbar row here is page markup — search inputs and
				<code>ViewOptions</code> compose per page — and the checkbox column is
				<code>DataTable.selectColumn(columnHelper)</code>, first in every list.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<DataTable.Root table={paymentsTable}>
				<div class="flex items-center gap-2">
					<Input
						placeholder="Filter emails…"
						value={paymentEmailFilter}
						oninput={(e) => paymentsTable.getColumn('email')?.setFilterValue(e.currentTarget.value)}
						class="max-w-sm"
					/>
					<DataTable.ViewOptions class="ms-auto" />
				</div>
				<DataTable.Content />
				<DataTable.Pagination noun="payment" pageSizeOptions={[5, 10, 20, 30, 50]} />
			</DataTable.Root>
		</Card.Content>
	</Card.Root>

	<Separator />
	<p class="text-muted-foreground pb-4 text-sm">
		Need a shadcn primitive not shown here? Add it with
		<code>npx shadcn-svelte@latest add &lt;component&gt;</code> — it lands in
		<code>src/lib/components/ui/</code> as editable source, same as these. Need a richer,
		motion-aware control? Port it from Solid Core's <code>src/lib/primitives/interior/</code> into
		<code>src/lib/components/enhanced/</code>, point its imports at <code>$lib/utils.js</code> and
		<code>$lib/motion.js</code>, add the two export lines, and give it a card here.
	</p>
</div>
