<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { goto, invalidate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import LinkIcon from '@lucide/svelte/icons/link';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserIcon from '@lucide/svelte/icons/user';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		CALENDAR_VIEWS,
		dayKey,
		eventAccent,
		formatWhen,
		parseDayKey,
		shiftAnchor,
		startOfDay,
		timedSlot,
		visibleDays,
		type CalendarView,
		type Placement
	} from '$lib/calendar';
	import * as Calendar from '$lib/components/calendar/index.js';
	import { SegmentedControl } from '$lib/components/enhanced/segmented-control/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { featureTerms } from '$lib/features/terms';
	import { motionTransition, springs } from '$lib/motion.js';
	import { QUERY } from '$lib/queries';
	import type { CalendarEvent } from '$lib/server/crm/calendar';
	import { capitalize, cn } from '$lib/utils.js';
	import EventForm from './event-form.svelte';
	import { updateEventSchema, type EventFormValues } from './schema';

	/**
	 * The calendar page. The view and the day live in the URL and the load
	 * hands back the events around them; everything else — the forms, the
	 * popovers, the optimistic move while a drag is saving — is this page's,
	 * and the parts in `$lib/components/calendar` only draw what they are
	 * given and say what the pointer did.
	 */
	let { data } = $props();

	// "Calendar" and one "event" here; "Schedule" and one "appointment" in a practice.
	const terms = $derived(featureTerms(page.data.terms, 'calendar'));

	// --- the day and the view, from the URL --------------------------------

	// A calendar is a wall-clock instrument and the server does not know the
	// viewer's clock, so the grid is drawn once the browser is in charge; until
	// then the placeholder holds its place.
	let mounted = $state(false);
	let today = $state(startOfDay(new Date()));
	onMount(() => {
		mounted = true;
		today = startOfDay(new Date());
		const tick = setInterval(() => (today = startOfDay(new Date())), 60_000);
		return () => clearInterval(tick);
	});

	const view = $derived(data.view);
	const anchor = $derived(parseDayKey(data.date) ?? today);
	const days = $derived(visibleDays(view, anchor));
	/** Which way the last step went, so the title and the grid slide the same way. */
	let direction = $state<-1 | 0 | 1>(0);

	function go(next: { view?: CalendarView; date?: Date }, stepped: -1 | 0 | 1) {
		direction = stepped;
		const url = new URL(page.url);
		url.searchParams.set('view', next.view ?? view);
		url.searchParams.set('date', dayKey(next.date ?? anchor));
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	const VIEW_OPTIONS = CALENDAR_VIEWS.map((value) => ({ value, label: capitalize(value) }));

	// --- the events, with a drag applied before the server has answered ------

	/** Where an event was dropped, until the grid reloads with it there. */
	const pending = new SvelteMap<string, Placement>();
	const events = $derived(
		data.events.map((event) => {
			const placement = pending.get(event.id);
			return placement ? { ...event, ...placement } : event;
		})
	);

	/** A drag in flight: the event as it was, so a toast can offer the way back. */
	const moves = new SvelteMap<
		string,
		{ event: CalendarEvent; before: Placement; placement: Placement }
	>();
	let moveFormEl = $state<HTMLFormElement | null>(null);

	/**
	 * A drag or a stretch landed: post the two instants to the `move` action
	 * and let the block stay where it was dropped while the answer comes back.
	 * A gesture has no form to post, so it fills the hidden one below and asks
	 * it to submit — the staff page's hold-to-remove does the same — and a drag
	 * takes the same road as the booking form: same gate, same RLS, same
	 * `message()` on refusal.
	 */
	const { form: moveData, enhance: moveEnhance } = superForm(data.moveForm, {
		id: 'move-event',
		invalidateAll: false,
		// Two drags in flight at once is the normal case for someone tidying a week.
		multipleSubmits: 'allow',
		async onUpdated({ form }) {
			const moved = moves.get(form.data.id);
			moves.delete(form.data.id);
			if (!moved) return;
			if (form.valid) {
				await invalidate(QUERY.calendar);
				toast.success(`Moved to ${formatWhen({ ...moved.event, ...moved.placement })}`, {
					action: {
						label: 'Undo',
						onClick: () => move({ ...moved.event, ...moved.placement }, moved.before)
					}
				});
			} else {
				toast.error(form.message ?? `Could not move the ${terms.noun}.`);
			}
			// Only this drag's placement: a later drag of the same event has replaced it.
			if (pending.get(moved.event.id) === moved.placement) pending.delete(moved.event.id);
		},
		onError() {
			toast.error(`Could not move the ${terms.noun}.`);
			moves.clear();
			pending.clear();
		}
	});

	async function move(event: CalendarEvent, placement: Placement) {
		moves.set(event.id, {
			event,
			before: { starts_at: event.starts_at, ends_at: event.ends_at },
			placement
		});
		pending.set(event.id, placement);
		$moveData = { id: event.id, starts_at: placement.starts_at, ends_at: placement.ends_at };
		// The hidden inputs take the store's values on the next flush.
		await tick();
		moveFormEl?.requestSubmit();
	}

	// --- booking ----------------------------------------------------------

	let createOpen = $state(false);
	let createAnchor = $state<Calendar.CalendarAnchor | null>(null);
	/** The slot being booked, drawn as a ghost on the week until the popover closes. */
	let draft = $state<Calendar.SlotSelection | null>(null);
	let createForm = $state<EventForm | null>(null);
	/** What the booking form opens on; the popover's content mounts with it. */
	let createValues = $state<EventFormValues | null>(null);

	function openCreate(slot: Calendar.SlotSelection, at: Calendar.CalendarAnchor) {
		createValues = {
			id: '',
			title: '',
			starts_at: slot.starts_at,
			ends_at: slot.ends_at,
			all_day: slot.allDay,
			color: 'info',
			location: '',
			description: '',
			assigned_to: '',
			record: ''
		};
		draft = slot;
		createAnchor = at;
		createOpen = true;
	}

	/** The header's button: the next hour, today. */
	function openCreateNow(at: HTMLElement) {
		const now = new Date();
		openCreate({ ...timedSlot(today, (now.getHours() + 1) * 60), allDay: false }, at);
	}

	// --- one event's details ------------------------------------------------

	let selectedId = $state<string | null>(null);
	let detailsAnchor = $state<Calendar.CalendarAnchor | null>(null);
	// Read off the list rather than held as a copy, so a drag or a save is
	// reflected in the open popover with no extra wiring.
	const selected = $derived(events.find((event) => event.id === selectedId) ?? null);
	const selectedLink = $derived(selectedId ? (data.links[selectedId] ?? null) : null);
	const selectedPerson = $derived(
		selected?.assigned_to ? (data.people[selected.assigned_to] ?? 'Former member') : null
	);

	function openDetails(event: CalendarEvent, at: Calendar.CalendarAnchor) {
		createOpen = false;
		detailsAnchor = at;
		selectedId = event.id;
	}

	// --- editing and deleting -----------------------------------------------

	let editOpen = $state(false);
	/** The event the edit form opens on; the modal's content mounts with it. */
	let editValues = $state<EventFormValues | null>(null);

	function openEdit(event: CalendarEvent) {
		editValues = {
			id: event.id,
			title: event.title,
			starts_at: event.starts_at,
			ends_at: event.ends_at,
			all_day: event.all_day,
			color: event.color,
			location: event.location ?? '',
			description: event.description ?? '',
			assigned_to: event.assigned_to ?? '',
			record: event.entity_type && event.entity_id ? `${event.entity_type}:${event.entity_id}` : ''
		};
		selectedId = null;
		editOpen = true;
	}

	let removingId = $state<string | null>(null);
	const removing = $derived(events.find((event) => event.id === removingId) ?? null);

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(data.removeForm, {
		id: 'delete-event',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			removingId = null;
			toast.success(`${capitalize(terms.noun)} deleted`);
			invalidate(QUERY.calendar);
		}
	});

	// --- keys --------------------------------------------------------------

	/** t for today, the arrows to step, m/w/d for the views, n to book — when nothing else has the keyboard. */
	function handleKeydown(e: KeyboardEvent) {
		// A control that already took the key (the view switch's arrows) keeps it.
		if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
		if (createOpen || editOpen || selectedId || removingId) return;
		const target = e.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		) {
			return;
		}
		switch (e.key) {
			case 't':
				go({ date: today }, 0);
				break;
			case 'ArrowLeft':
				go({ date: shiftAnchor(view, anchor, -1) }, -1);
				break;
			case 'ArrowRight':
				go({ date: shiftAnchor(view, anchor, 1) }, 1);
				break;
			case 'm':
				go({ view: 'month' }, 0);
				break;
			case 'w':
				go({ view: 'week' }, 0);
				break;
			case 'd':
				go({ view: 'day' }, 0);
				break;
			case 'n':
				if (data.canManage && addButton) openCreateNow(addButton);
				break;
			default:
				return;
		}
		e.preventDefault();
	}

	let addButton = $state<HTMLElement | null>(null);
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- What a drag posts: the event and the two instants it changed, nothing else. -->
<form method="POST" action="?/move" class="hidden" bind:this={moveFormEl} use:moveEnhance>
	<input type="hidden" name="id" value={$moveData.id} />
	<input type="hidden" name="starts_at" value={$moveData.starts_at} />
	<input type="hidden" name="ends_at" value={$moveData.ends_at} />
</form>

<!-- A fixed height, not a minimum: the grid fills the room and scrolls inside it,
     so a week is never a page-long scroll and a month always fits. -->
<div class="flex h-[calc(100dvh-var(--header-height)-72px)] min-h-[34rem] flex-col gap-5">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canManage}
			<PageHeader.Actions>
				<Button bind:ref={addButton} onclick={(e) => openCreateNow(e.currentTarget)}>
					<PlusIcon />
					Add {terms.noun}
				</Button>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<Calendar.Toolbar>
		<div class="flex min-w-0 items-center gap-1.5">
			<Button variant="outline" size="sm" onclick={() => go({ date: today }, 0)}>Today</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				aria-label="Previous {view}"
				onclick={() => go({ date: shiftAnchor(view, anchor, -1) }, -1)}
			>
				<ChevronLeftIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				aria-label="Next {view}"
				onclick={() => go({ date: shiftAnchor(view, anchor, 1) }, 1)}
			>
				<ChevronRightIcon />
			</Button>
			{#if mounted}
				<Calendar.Title {view} {anchor} {direction} class="ms-1" />
			{/if}
		</div>
		<SegmentedControl
			label="View"
			options={VIEW_OPTIONS}
			value={view}
			onValueChange={(value) => {
				if (value === 'month' || value === 'week' || value === 'day') go({ view: value }, 0);
			}}
		/>
	</Calendar.Toolbar>

	<Calendar.Root
		class={cn(
			'transition-opacity duration-200',
			navigating.to && 'opacity-70 motion-reduce:opacity-100'
		)}
	>
		{#if mounted}
			{#key `${view}:${dayKey(anchor)}`}
				<div
					class="flex min-h-0 flex-1 flex-col"
					in:motionTransition={{
						keyframes: { opacity: [0, 1], x: [direction * 28, 0] },
						transition: springs.settle,
						reduced: { keyframes: { opacity: [0, 1] } }
					}}
				>
					{#if view === 'month'}
						<Calendar.Month
							{anchor}
							{today}
							{events}
							{selectedId}
							canManage={data.canManage}
							onSelectDay={(day, at) =>
								openCreate({ ...timedSlot(day, 9 * 60), allDay: false }, at)}
							onSelectEvent={openDetails}
							onOpenDay={(day) => go({ view: 'day', date: day }, 0)}
							onMove={move}
						/>
					{:else}
						<Calendar.Week
							{days}
							{today}
							{events}
							{selectedId}
							{draft}
							canManage={data.canManage}
							onSelectSlot={openCreate}
							onSelectEvent={openDetails}
							onMove={move}
						/>
					{/if}
				</div>
			{/key}
		{:else}
			<Calendar.Placeholder />
		{/if}
	</Calendar.Root>
</div>

<!-- Booking: a popover on the slot that was clicked or drawn. -->
{#if data.canManage}
	<Popover.Root
		bind:open={createOpen}
		onOpenChange={(open) => {
			if (!open) draft = null;
		}}
	>
		<Popover.Content
			customAnchor={createAnchor}
			side="right"
			align="start"
			sideOffset={10}
			collisionPadding={16}
			class="w-[22rem] p-0"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				createForm?.focusTitle();
			}}
		>
			<EventForm
				bind:this={createForm}
				data={data.createForm}
				values={createValues}
				id="create-event"
				action="?/create"
				roster={data.roster}
				records={data.records}
				onSaved={() => {
					createOpen = false;
					toast.success(`${capitalize(terms.noun)} booked`);
					invalidate(QUERY.calendar);
				}}
			>
				{#snippet children({ fields, submitting })}
					<div class="grid gap-4 p-4">
						{@render fields()}
					</div>
					<div class="bg-muted/60 flex items-center justify-end gap-2 border-t px-4 py-3">
						<Popover.Close>
							{#snippet child({ props })}
								<Button variant="ghost" size="sm" {...props}>Cancel</Button>
							{/snippet}
						</Popover.Close>
						<Button type="submit" size="sm" disabled={submitting}>
							{submitting ? 'Booking…' : 'Book'}
						</Button>
					</div>
				{/snippet}
			</EventForm>
		</Popover.Content>
	</Popover.Root>
{/if}

<!-- One event's details, on the block or chip that was clicked. -->
<Popover.Root
	open={selected !== null}
	onOpenChange={(open) => {
		if (!open) selectedId = null;
	}}
>
	<Popover.Content
		customAnchor={detailsAnchor}
		side="right"
		align="start"
		sideOffset={10}
		collisionPadding={16}
		class="w-80 overflow-hidden p-0"
	>
		{#if selected}
			<div class="flex">
				<div class={cn('w-1.5 shrink-0', eventAccent(selected.color))}></div>
				<div class="grid min-w-0 flex-1 gap-3 p-4">
					<div class="flex items-start justify-between gap-2">
						<h3 class="min-w-0 text-base leading-snug font-semibold text-balance">
							{selected.title}
						</h3>
						<div class="-me-1.5 -mt-1 flex shrink-0 items-center">
							{#if data.canManage}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									aria-label="Edit"
									onclick={() => openEdit(selected)}
								>
									<PencilIcon />
								</Button>
							{/if}
							{#if data.canDelete}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									aria-label="Delete"
									onclick={() => {
										removingId = selected.id;
										selectedId = null;
									}}
								>
									<Trash2Icon />
								</Button>
							{/if}
							<Popover.Close>
								{#snippet child({ props })}
									<Button variant="ghost" size="icon" class="size-7" aria-label="Close" {...props}>
										<XIcon />
									</Button>
								{/snippet}
							</Popover.Close>
						</div>
					</div>
					<div class="grid gap-2 text-sm">
						<div class="flex items-start gap-2.5">
							<ClockIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
							<span>{formatWhen(selected)}</span>
						</div>
						{#if selected.location}
							<div class="flex items-start gap-2.5">
								<MapPinIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<span class="min-w-0 break-words">{selected.location}</span>
							</div>
						{/if}
						{#if selectedLink}
							<div class="flex items-start gap-2.5">
								<LinkIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<a href={selectedLink.href} class="font-medium underline-offset-4 hover:underline">
									{selectedLink.label}
								</a>
							</div>
						{/if}
						{#if selectedPerson}
							<div class="flex items-start gap-2.5">
								<UserIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<span>{selectedPerson}</span>
							</div>
						{/if}
						{#if selected.description}
							<p class="text-muted-foreground mt-1 whitespace-pre-line">{selected.description}</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>

<!-- Editing: the same form, every field showing, in a card. -->
{#if data.canManage}
	<Modal.Root bind:open={editOpen}>
		<Modal.Content>
			<EventForm
				data={data.updateForm}
				values={editValues}
				id="update-event"
				action="?/update"
				schema={updateEventSchema}
				roster={data.roster}
				records={data.records}
				expanded
				onSaved={() => {
					editOpen = false;
					toast.success(`${capitalize(terms.noun)} saved`);
					invalidate(QUERY.calendar);
				}}
			>
				{#snippet children({ fields, submitting })}
					<Modal.Card>
						<Modal.Header>
							<Modal.Title><CalendarDaysIcon /> Edit {terms.noun}</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							{@render fields()}
						</Modal.Body>
					</Modal.Card>
					<Modal.Footer>
						<Modal.Cancel>Cancel</Modal.Cancel>
						<Modal.Action type="submit" disabled={submitting}>
							{submitting ? 'Saving…' : 'Save changes'}
						</Modal.Action>
					</Modal.Footer>
				{/snippet}
			</EventForm>
		</Modal.Content>
	</Modal.Root>
{/if}

<!-- Deleting: the one destructive act the page offers. -->
<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/remove" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Delete {removing.title}?</Modal.Title>
						<Modal.Description>
							{formatWhen(removing)}. It comes off the calendar for everyone.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" disabled={$deleting}>
						{$deleting ? 'Deleting…' : 'Delete'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
