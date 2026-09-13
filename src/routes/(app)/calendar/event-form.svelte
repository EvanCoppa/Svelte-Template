<script lang="ts">
	import type { Snippet } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import {
		EVENT_COLOR_NAMES,
		EVENT_COLORS,
		EVENT_SWATCH_CLASSES,
		allDaySlot,
		daysBetween,
		exclusiveEndAfter,
		fromLocalDateInput,
		fromLocalDateTimeInput,
		inclusiveEndDate,
		timedSlot,
		toLocalDateInput,
		toLocalDateTimeInput
	} from '$lib/calendar';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ComboboxGroup } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { recordTerms, type RecordKind } from '$lib/crm/records';
	import { motionCollapse } from '$lib/motion.js';
	import { recordRef, type LinkableRecord } from '$lib/schemas/record-ref';
	import { cn } from '$lib/utils.js';
	import { createEventSchema, type Assignee, type EventFormValues } from './schema';

	/**
	 * The one event form, worn twice: as the booking popover a click on the
	 * grid opens, and inside the edit modal. It owns the superForm for the
	 * `SuperValidated` it is given and posts to the action it is told; the
	 * page decides where it lives, what wraps it and what happens when it
	 * saves. The fields are handed back to the page as a snippet, so the
	 * popover can lay them out tight and the modal can sit them in a card.
	 *
	 * The two instants are the form's truth (`starts_at`, `ends_at`, ISO,
	 * exclusive end); the visible date and time inputs are windows onto them
	 * in the browser's zone, and flip between a date and a date-time as the
	 * all-day switch says. Nothing here decides who may save: the action does.
	 */
	let {
		data,
		values = null,
		id,
		action,
		schema = createEventSchema,
		roster,
		records,
		expanded = false,
		onSaved,
		children,
		class: className
	}: {
		data: SuperValidated<EventFormValues>;
		/**
		 * What the form opens on: the slot that was clicked, the event being
		 * edited. The form is born with them — a popover's content exists only
		 * while it is open, so every open is a fresh form.
		 */
		values?: Partial<EventFormValues> | null;
		/** The superforms id, shared with the load and the action. */
		id: string;
		action: string;
		/** The create schema by default; the edit form validates against the one that wants an id. */
		schema?: typeof createEventSchema;
		roster: readonly Assignee[];
		records: readonly LinkableRecord[];
		/** Show every field at once, rather than behind "More options". */
		expanded?: boolean;
		onSaved: () => void;
		/** The surface around the fields: the popover body, the modal card. */
		children: Snippet<[{ fields: Snippet; submitting: boolean }]>;
		class?: string;
	} = $props();

	// Wired once, like `CreateRecord`: a surface shows one form for its lifetime.
	// The popover and the modal mount their content fresh on every open, so the
	// values the page hands over are simply what the form is born with.
	const { form, errors, message, constraints, submitting, enhance } = superForm(
		values ? { ...data, data: { ...data.data, ...values } } : data,
		{
			id,
			validators: zod4Client(schema),
			// Only the grid is stale after a save (docs/data-invalidation.md).
			invalidateAll: false,
			resetForm: false,
			onUpdated({ form: result }) {
				if (result.valid) onSaved();
			}
		}
	);

	let titleEl = $state<HTMLInputElement | null>(null);
	let more = $state(false);
	const showMore = $derived(expanded || more);

	export function focusTitle() {
		titleEl?.focus();
	}

	const rosterOptions = $derived(
		roster.map((member) => ({ value: member.userId, label: member.name }))
	);

	/** The records, sectioned by kind and named as the org's industry names the kind. */
	const recordGroups = $derived.by((): ComboboxGroup[] => {
		const kinds: RecordKind[] = [];
		for (const record of records) if (!kinds.includes(record.kind)) kinds.push(record.kind);
		return kinds.map((kind) => ({
			label: recordTerms(page.data.terms, kind).name,
			options: records
				.filter((record) => record.kind === kind)
				.map((record) => ({ value: recordRef(kind, record.id), label: record.name }))
		}));
	});

	// --- the two instants, through the inputs ---------------------------

	/** Moving the start keeps the length, the way a booking is moved rather than cut. */
	function setStart(value: string) {
		const iso = $form.all_day ? fromLocalDateInput(value) : fromLocalDateTimeInput(value);
		if (!iso) return;
		const length = Date.parse($form.ends_at) - Date.parse($form.starts_at);
		$form.starts_at = iso;
		if (length > 0) $form.ends_at = new Date(Date.parse(iso) + length).toISOString();
	}

	function setEnd(value: string) {
		const iso = $form.all_day ? exclusiveEndAfter(value) : fromLocalDateTimeInput(value);
		if (iso) $form.ends_at = iso;
	}

	/** An all-day event covers whole days; a timed one gets the morning back. */
	function flipAllDay(on: boolean) {
		const start = new Date($form.starts_at);
		const slot = on
			? allDaySlot(
					start,
					Math.max(1, daysBetween(start, new Date(Date.parse($form.ends_at) - 1)) + 1)
				)
			: timedSlot(start, 9 * 60);
		$form.all_day = on;
		$form.starts_at = slot.starts_at;
		$form.ends_at = slot.ends_at;
	}
</script>

<form method="POST" {action} class={cn('contents', className)} use:enhance>
	{@render children({ fields, submitting: $submitting })}
</form>

{#snippet fields()}
	<FormAlert message={$message} class="mb-0" />
	<!-- The truth: two instants, and the colour the swatches pick. -->
	<input type="hidden" name="id" value={$form.id} />
	<input type="hidden" name="starts_at" value={$form.starts_at} />
	<input type="hidden" name="ends_at" value={$form.ends_at} />

	<div class="grid gap-1.5">
		<Label for="{id}-title" class="sr-only">Title</Label>
		<Input
			bind:ref={titleEl}
			id="{id}-title"
			name="title"
			placeholder="Add a title"
			autocomplete="off"
			class="focus-visible:border-primary h-10 rounded-none border-0 border-b bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
			aria-invalid={$errors.title ? 'true' : undefined}
			bind:value={$form.title}
			{...$constraints.title}
		/>
		{#if $errors.title}
			<p class="text-destructive text-sm">{$errors.title}</p>
		{/if}
	</div>

	<!-- The two instants, as the wall clock: a line each, because two date-time
	     inputs side by side are wider than any popover. -->
	<div class="grid gap-2">
		<div class="grid grid-cols-[1rem_2.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
			<ClockIcon class="text-muted-foreground size-4" />
			<Label for="{id}-starts" class="text-muted-foreground text-xs font-normal">Starts</Label>
			<Input
				id="{id}-starts"
				type={$form.all_day ? 'date' : 'datetime-local'}
				class="h-8 min-w-0 text-sm"
				value={$form.all_day
					? toLocalDateInput($form.starts_at)
					: toLocalDateTimeInput($form.starts_at)}
				oninput={(e) => setStart(e.currentTarget.value)}
			/>
			<span></span>
			<Label for="{id}-ends" class="text-muted-foreground text-xs font-normal">Ends</Label>
			<Input
				id="{id}-ends"
				type={$form.all_day ? 'date' : 'datetime-local'}
				class="h-8 min-w-0 text-sm"
				aria-invalid={$errors.ends_at ? 'true' : undefined}
				value={$form.all_day
					? inclusiveEndDate($form.ends_at)
					: toLocalDateTimeInput($form.ends_at)}
				oninput={(e) => setEnd(e.currentTarget.value)}
			/>
		</div>
		{#if $errors.ends_at}
			<p class="text-destructive ps-6 text-sm">{$errors.ends_at}</p>
		{/if}
		<div class="flex items-center justify-between ps-6">
			<Label for="{id}-all-day" class="text-muted-foreground font-normal">All day</Label>
			<Switch
				id="{id}-all-day"
				name="all_day"
				checked={$form.all_day}
				onCheckedChange={flipAllDay}
			/>
		</div>
	</div>

	<!-- The swatches are a radio group: arrow keys move, one tab stop, and the
	     pick posts under `color` like any radio would. -->
	<RadioGroup.Root
		name="color"
		aria-label="Colour"
		bind:value={$form.color}
		class="flex w-auto flex-wrap items-center gap-2 ps-6"
	>
		{#each EVENT_COLORS as tone (tone)}
			<RadioGroup.Item
				value={tone}
				aria-label={EVENT_COLOR_NAMES[tone]}
				class={cn(
					'size-5 border-0 transition-transform duration-150 hover:scale-110 data-checked:scale-110 motion-reduce:transition-none',
					EVENT_SWATCH_CLASSES[tone]
				)}
			/>
		{/each}
	</RadioGroup.Root>

	{#if showMore}
		<div class="grid gap-3 overflow-hidden" transition:motionCollapse>
			<div class="grid gap-1.5">
				<Label for="{id}-location">Location</Label>
				<Input
					id="{id}-location"
					name="location"
					placeholder="A room, an address, a link"
					aria-invalid={$errors.location ? 'true' : undefined}
					bind:value={$form.location}
					{...$constraints.location}
				/>
				{#if $errors.location}
					<p class="text-destructive text-sm">{$errors.location}</p>
				{/if}
			</div>
			<div class="grid gap-1.5">
				<Label for="{id}-assignee">Who</Label>
				<Combobox
					id="{id}-assignee"
					name="assigned_to"
					options={rosterOptions}
					bind:value={$form.assigned_to}
					placeholder="Nobody in particular"
					searchPlaceholder="Search the team…"
					clearable
				/>
			</div>
			{#if recordGroups.length > 0}
				<div class="grid gap-1.5">
					<Label for="{id}-record">For</Label>
					<Combobox
						id="{id}-record"
						name="record"
						groups={recordGroups}
						bind:value={$form.record}
						placeholder="Link a record"
						searchPlaceholder="Search by name…"
						invalid={Boolean($errors.record)}
						clearable
					/>
					{#if $errors.record}
						<p class="text-destructive text-sm">{$errors.record}</p>
					{/if}
				</div>
			{/if}
			<div class="grid gap-1.5">
				<Label for="{id}-description">Notes</Label>
				<Textarea
					id="{id}-description"
					name="description"
					rows={3}
					aria-invalid={$errors.description ? 'true' : undefined}
					bind:value={$form.description}
					{...$constraints.description}
				/>
				{#if $errors.description}
					<p class="text-destructive text-sm">{$errors.description}</p>
				{/if}
			</div>
		</div>
	{:else}
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground -ms-2 w-fit"
			onclick={() => (more = true)}
		>
			More options
			<ChevronDownIcon />
		</Button>
	{/if}
{/snippet}
