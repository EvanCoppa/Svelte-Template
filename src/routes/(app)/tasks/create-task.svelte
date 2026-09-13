<script lang="ts">
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import AtSignIcon from '@lucide/svelte/icons/at-sign';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import CalendarArrowUpIcon from '@lucide/svelte/icons/calendar-arrow-up';
	import CalendarXIcon from '@lucide/svelte/icons/calendar-x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquareCheckIcon from '@lucide/svelte/icons/square-check';
	import UserIcon from '@lucide/svelte/icons/user';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import * as Modal from '$lib/components/modal/index.js';
	import { initialsOf } from '$lib/components/staff/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { avatarTint } from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { recordTerms, type RecordKind } from '$lib/crm/records';
	import { dueLabel } from '$lib/crm/tasks';
	import { QUERY } from '$lib/queries';
	import { parseRecordRef, recordRef, type LinkableRecord } from '$lib/schemas/record-ref';
	import { capitalize } from '$lib/utils.js';
	import { createTaskSchema, type CreateTaskValues } from './schema';

	/**
	 * The task modal: the one "Add task" button on the tasks page, and the
	 * form behind it.
	 *
	 * A task is the one kind of record that is not created through the
	 * generic `CreateRecord` form, and the modal is built around why: a task
	 * is a sentence — "Send the introductory email" — and three things about
	 * it that are set far more often than they are typed, so they are chips
	 * under the title rather than fields beside it. **When** (a calendar with
	 * the days that get picked most as one-click choices), **who** (people
	 * from the roster, several at once, because assignment is a relationship
	 * — docs/tasks.md — and the post writes those rows with the task), and
	 * **what it is about** (a company or a person, one picker for both parties,
	 * offering only the kinds the reader may open). A new task starts due
	 * today and assigned to the writer, since that is what most of them are.
	 *
	 * "Create more" keeps the modal open after a save and clears the title
	 * only: the day, the people and the record stay, because five tasks in a
	 * row are usually five things for the same person about the same account.
	 * Details and priority are edited on the record page through the generic
	 * form, where every other kind's fields live; they are not first-line
	 * facts about a task, and a modal that asks for them is one that gets
	 * filled in later.
	 *
	 * The post is the page's own `?/create` action (`createTaskSchema`), and
	 * every field is a hidden input bound to the superForm store — so Enter
	 * in the title submits, and without JavaScript the title still posts.
	 */
	let {
		form: data,
		members,
		records,
		currentUserId
	}: {
		form: SuperValidated<CreateTaskValues>;
		/** The roster the assignee picker offers, named as the staff page names people. */
		members: readonly { userId: string; name: string }[];
		/** The companies and people the record picker offers — only the kinds the reader may open. */
		records: readonly LinkableRecord[];
		/** Who a new task is assigned to until somebody says otherwise. */
		currentUserId: string;
	} = $props();

	const terms = $derived(recordTerms(page.data.terms, 'task'));

	let open = $state(false);
	let createMore = $state(false);
	let titleEl = $state<HTMLInputElement | null>(null);

	const { form, errors, message, constraints, submitting, enhance } = superForm(data, {
		id: 'create-task',
		validators: zod4Client(createTaskSchema),
		// Only the list this adds a row to is stale (docs/data-invalidation.md).
		invalidateAll: false,
		// The modal decides what a saved form is reset to, below.
		resetForm: false,
		async onUpdated({ form: result }) {
			if (!result.valid) return;
			toast.success(`${capitalize(terms.noun)} created`);
			await invalidate(QUERY.tasks);
			if (createMore) {
				$form = { ...$form, title: '' };
				await tick();
				titleEl?.focus();
			} else {
				open = false;
			}
		}
	});

	/** What the form opens on, every time: blank, due today, on the writer. */
	function start() {
		$form = {
			title: '',
			due_at: instantFor(today(getLocalTimeZone())),
			assignees: members.some((member) => member.userId === currentUserId) ? [currentUserId] : [],
			record: ''
		};
	}

	// --- when --------------------------------------------------------------

	/**
	 * A day as the column stores it: the end of that day in the reader's own
	 * zone, so a task due "today" is not late the moment it is written and
	 * the board's piles, which count by day, put it where it was meant to go.
	 */
	function instantFor(day: DateValue): string {
		const at = day.toDate(getLocalTimeZone());
		at.setHours(23, 59, 59, 999);
		return at.toISOString();
	}

	/** The calendar's value: the day the instant falls on, in the reader's zone. */
	const dueDay = $derived.by((): DateValue | undefined => {
		if ($form.due_at === '') return undefined;
		const at = new Date($form.due_at);
		if (Number.isNaN(at.getTime())) return undefined;
		return new CalendarDate(at.getFullYear(), at.getMonth() + 1, at.getDate());
	});

	/** "Today", "Tomorrow", "Friday", "Sep 30" — the words a card uses for the same day. */
	const dueText = $derived(
		dueLabel({ due_at: $form.due_at === '' ? null : $form.due_at, status: 'todo' }, new Date()) ??
			'No date'
	);

	let dateOpen = $state(false);

	function pickDay(day: DateValue | undefined) {
		$form.due_at = day ? instantFor(day) : '';
		dateOpen = false;
	}

	function pickIn(days: number) {
		pickDay(today(getLocalTimeZone()).add({ days }));
	}

	// --- who ---------------------------------------------------------------

	let peopleOpen = $state(false);

	const assigned = $derived(
		$form.assignees.flatMap((userId) => members.filter((member) => member.userId === userId))
	);
	const unassigned = $derived(members.filter((member) => !$form.assignees.includes(member.userId)));

	/** "Assigned to you", "Dana Reyes", "Dana Reyes +2", or nobody. */
	const peopleText = $derived.by(() => {
		if (assigned.length === 0) return 'Unassigned';
		if (assigned.length === 1 && assigned[0].userId === currentUserId) return 'Assigned to you';
		const first = assigned[0].name;
		return assigned.length === 1 ? first : `${first} +${String(assigned.length - 1)}`;
	});

	function addPerson(userId: string) {
		if (!$form.assignees.includes(userId)) $form.assignees = [...$form.assignees, userId];
	}

	function removePerson(userId: string) {
		$form.assignees = $form.assignees.filter((id) => id !== userId);
	}

	// --- what it is about --------------------------------------------------

	let recordOpen = $state(false);

	/** The records, sectioned by kind and named as the org's industry names the kind. */
	const recordGroups = $derived.by(() => {
		const kinds: RecordKind[] = [];
		for (const record of records) if (!kinds.includes(record.kind)) kinds.push(record.kind);
		return kinds.map((kind) => ({
			kind,
			label: recordTerms(page.data.terms, kind).name,
			records: records.filter((record) => record.kind === kind)
		}));
	});

	const linked = $derived.by(() => {
		const ref = $form.record === '' ? null : parseRecordRef($form.record);
		return ref ? records.find((r) => r.kind === ref.kind && r.id === ref.id) : undefined;
	});

	function pickRecord(record: LinkableRecord | null) {
		$form.record = record ? recordRef(record.kind, record.id) : '';
		recordOpen = false;
	}
</script>

<Modal.Root
	bind:open
	onOpenChange={(next) => {
		if (next) start();
	}}
>
	<Modal.Trigger>
		{#snippet child({ props })}
			<Button {...props}>
				<PlusIcon />
				Add {terms.noun}
			</Button>
		{/snippet}
	</Modal.Trigger>

	<Modal.Content class="sm:max-w-2xl">
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/create" use:enhance>
			<!-- The truth behind the chips: an instant, a person per input, a record ref. -->
			<input type="hidden" name="due_at" value={$form.due_at} />
			<input type="hidden" name="record" value={$form.record} />
			{#each $form.assignees as userId (userId)}
				<input type="hidden" name="assignees" value={userId} />
			{/each}

			<Modal.Card>
				<Modal.Header>
					<Modal.Title><SquareCheckIcon /> Create {terms.noun}</Modal.Title>
				</Modal.Header>
				<Modal.Body class="gap-3">
					<FormAlert message={$message} class="mb-0" />
					<div class="grid gap-1.5">
						<Label for="create-task-title" class="sr-only">Title</Label>
						<Input
							bind:ref={titleEl}
							id="create-task-title"
							name="title"
							placeholder="Send the introductory email"
							autocomplete="off"
							class="h-11 rounded-none border-0 bg-transparent px-0 text-lg shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
							aria-invalid={$errors.title ? 'true' : undefined}
							bind:value={$form.title}
							{...$constraints.title}
						/>
						{#if $errors.title}
							<p class="text-destructive text-sm">{$errors.title}</p>
						{/if}
					</div>

					<!-- When, who, and what it is about: chips, because these are set
					     far more often than they are typed. -->
					<div class="-ms-2 flex flex-wrap items-center gap-1">
						{@render when()}
						{@render who()}
						{#if records.length > 0}
							{@render about()}
						{/if}
					</div>
					{#if $errors.record}
						<p class="text-destructive text-sm">{$errors.record}</p>
					{/if}
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Label class="text-muted-foreground flex items-center gap-2 ps-1 font-normal">
					<Switch bind:checked={createMore} />
					Create more
				</Label>
				<div class="flex items-center gap-2">
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$submitting}>
						{$submitting ? 'Saving…' : 'Save'}
					</Modal.Action>
				</div>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- The day. A calendar, and under it the days that get picked most. -->
{#snippet when()}
	<Popover.Root bind:open={dateOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} type="button" variant="ghost" size="sm" class="text-muted-foreground">
					<CalendarIcon />
					{dueText}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-auto p-2" align="start">
			<Calendar type="single" value={dueDay} onValueChange={pickDay} />
			<div class="flex flex-wrap gap-1 border-t pt-2">
				<Button type="button" variant="ghost" size="xs" onclick={() => pickIn(0)}>
					<CalendarIcon />Today
				</Button>
				<Button type="button" variant="ghost" size="xs" onclick={() => pickIn(1)}>
					<CalendarArrowUpIcon />Tomorrow
				</Button>
				<Button type="button" variant="ghost" size="xs" onclick={() => pickIn(7)}>
					<CalendarArrowUpIcon />Next week
				</Button>
				<Button type="button" variant="ghost" size="xs" onclick={() => pickDay(undefined)}>
					<CalendarXIcon />No date
				</Button>
			</div>
		</Popover.Content>
	</Popover.Root>
{/snippet}

<!-- The people. Those on it as chips, and a search over the rest. -->
{#snippet who()}
	<Popover.Root bind:open={peopleOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} type="button" variant="ghost" size="sm" class="text-muted-foreground">
					<AtSignIcon />
					{peopleText}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-80 p-0" align="start">
			<Command.Root>
				<Command.Input placeholder="Find a person…" />
				{#if assigned.length > 0}
					<div class="flex flex-wrap gap-1 border-b p-2">
						{#each assigned as person (person.userId)}
							<Badge variant="secondary" class="gap-1.5 py-1 pe-1">
								<Avatar.Root class="size-4">
									<Avatar.Fallback class="{avatarTint(person.userId)} text-[8px] font-medium">
										{initialsOf(person.name)}
									</Avatar.Fallback>
								</Avatar.Root>
								{person.name}
								<button
									type="button"
									class="hover:bg-foreground/10 rounded-sm p-0.5"
									aria-label="Remove {person.name}"
									onclick={() => removePerson(person.userId)}
								>
									<XIcon class="size-3" />
								</button>
							</Badge>
						{/each}
					</div>
				{/if}
				<Command.List>
					<Command.Empty>No one else to add</Command.Empty>
					{#each unassigned as member (member.userId)}
						<Command.Item value={member.name} onSelect={() => addPerson(member.userId)}>
							<Avatar.Root class="size-5">
								<Avatar.Fallback class="{avatarTint(member.userId)} text-[9px] font-medium">
									{initialsOf(member.name)}
								</Avatar.Fallback>
							</Avatar.Root>
							<span class="truncate">{member.name}</span>
							{#if member.userId === currentUserId}
								<span class="text-muted-foreground ms-auto text-xs">You</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/snippet}

<!-- The record. One search over the companies and the people, sectioned by kind. -->
{#snippet about()}
	<Popover.Root bind:open={recordOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} type="button" variant="ghost" size="sm" class="text-muted-foreground">
					{#if linked}
						{#if linked.kind === 'company'}<Building2Icon />{:else}<UserIcon />{/if}
						<span class="text-foreground">{linked.name}</span>
					{:else}
						<ArrowUpRightIcon />
						Add record
					{/if}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-80 p-0" align="start">
			<Command.Root>
				<Command.Input placeholder="Search…" />
				<Command.List>
					<Command.Empty>No records match</Command.Empty>
					{#if linked}
						<Command.Group>
							<Command.Item value="__none" onSelect={() => pickRecord(null)}>
								<XIcon />
								Remove {linked.name}
							</Command.Item>
						</Command.Group>
					{/if}
					{#each recordGroups as group (group.kind)}
						<Command.Group heading={group.label}>
							{#each group.records as record (record.id)}
								<Command.Item
									value="{group.label} {record.name} {record.id}"
									onSelect={() => pickRecord(record)}
								>
									{#if record.kind === 'company'}<Building2Icon />{:else}<UserIcon />{/if}
									<span class="truncate">{record.name}</span>
									{#if linked?.id === record.id}
										<CheckIcon class="ms-auto" />
									{/if}
								</Command.Item>
							{/each}
						</Command.Group>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/snippet}
