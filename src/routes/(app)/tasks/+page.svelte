<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ColumnsIcon from '@lucide/svelte/icons/columns-3';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as GroupList from '$lib/components/group-list/index.js';
	import * as Kanban from '$lib/components/kanban/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { initialsOf } from '$lib/components/staff/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { avatarTint } from '$lib/components/ui/avatar/index.js';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { BADGE_TONE_DOT_CLASSES } from '$lib/components/ui/badge/badge-tones.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import {
		dueLabel,
		groupTasksByBucket,
		groupTasksByStatus,
		TASK_BUCKET_LABEL,
		TASK_BUCKET_TONE,
		TASK_BUCKETS,
		taskIsOverdue
	} from '$lib/crm/tasks';
	import {
		PRIORITY_TONE,
		TASK_STATUS_GROUPS,
		TASK_STATUS_LABEL,
		TASK_STATUS_RING,
		TASK_STATUS_TONE,
		TASK_STATUSES,
		taskIsDone
	} from '$lib/crm/tones';
	import { createViewPreference } from '$lib/list-view.svelte';
	import { PRIORITY_OPTIONS } from '$lib/schemas/records';
	import { capitalize } from '$lib/utils.js';
	import { QUERY } from '$lib/queries';
	import type { TaskAssignee, Task } from '$lib/server/crm/tasks';
	import type { Enums } from '$lib/database.types';

	let { data } = $props();

	const terms = $derived(recordTerms(page.data.terms, 'task'));

	/**
	 * Board or list, remembered on this machine. A board wants a wide screen
	 * and a list reads better on a narrow one, so this is the device's answer
	 * rather than the account's (docs/user-preferences.md).
	 */
	const view = createViewPreference('tasks.view', ['board', 'list'] as const);

	/**
	 * Now, for the piles and the due labels. Read once per render rather than
	 * per row so every task on screen is bucketed against the same instant —
	 * and in the reader's own zone, which is why it is not the server's.
	 */
	const now = $derived.by(() => {
		void data.tasks;
		return new Date();
	});

	/** Moves in flight, so a dropped card stays where it landed while it saves. */
	const pending = new SvelteMap<string, Enums<'task_status'>>();

	const tasks = $derived(
		data.tasks.map((task) => {
			const next = pending.get(task.id);
			return next && next !== task.status ? { ...task, status: next } : task;
		})
	);

	const byStatus = $derived(groupTasksByStatus(tasks, TASK_STATUSES));
	const piles = $derived(groupTasksByBucket(tasks, now));

	/** A column's cards: its statuses' piles, in the order the group lists them. */
	function cardsOf(group: (typeof TASK_STATUS_GROUPS)[number]): Task[] {
		return group.statuses.flatMap((status) => byStatus[status.value]);
	}

	let moveFormEl = $state<HTMLFormElement | null>(null);
	let scheduleFormEl = $state<HTMLFormElement | null>(null);
	let prioritizeFormEl = $state<HTMLFormElement | null>(null);
	let assignFormEl = $state<HTMLFormElement | null>(null);
	let unassignFormEl = $state<HTMLFormElement | null>(null);

	/** Which card has its due-date popover open, and what is typed in it. */
	let scheduling = $state<string | null>(null);
	let dueDraft = $state('');

	/**
	 * Every write on this page is a gesture — a card dropped, an arrow key, a
	 * checkbox, a menu item, a date picked in a popover — and a gesture has no
	 * form of its own to post. So each one fills the matching hidden form below
	 * and asks it to submit: the calendar's drag-to-move and the staff page's
	 * hold-to-remove take the same road, so a gesture hits the same gate, the
	 * same RLS and the same `message()` on refusal as a form would.
	 */
	const {
		form: moveData,
		enhance: moveEnhance,
		submitting
	} = superForm(data.moveForm, {
		id: 'move-task',
		invalidateAll: false,
		// Ticking off three things in a row is the normal case here.
		multipleSubmits: 'allow',
		async onUpdated({ form }) {
			const moved = form.data.id;
			if (form.valid) {
				await invalidate(QUERY.tasks);
			} else {
				toast.error(form.message ?? `Could not move the ${terms.noun}.`);
			}
			// Only if a later move of the same task has not replaced it.
			if (pending.get(moved) === form.data.status) pending.delete(moved);
		},
		onError() {
			toast.error(`Could not move the ${terms.noun}.`);
			pending.clear();
		}
	});

	const { form: scheduleData, enhance: scheduleEnhance } = superForm(data.scheduleForm, {
		id: 'schedule-task',
		invalidateAll: false,
		multipleSubmits: 'allow',
		onUpdated: ({ form }) => settled(form.valid, form.message, 'Could not change the due date.'),
		onError: () => void settled(false, undefined, 'Could not change the due date.')
	});

	const { form: prioritizeData, enhance: prioritizeEnhance } = superForm(data.prioritizeForm, {
		id: 'prioritize-task',
		invalidateAll: false,
		multipleSubmits: 'allow',
		onUpdated: ({ form }) => settled(form.valid, form.message, 'Could not change the priority.'),
		onError: () => void settled(false, undefined, 'Could not change the priority.')
	});

	const { form: assignData, enhance: assignEnhance } = superForm(data.assignForm, {
		id: 'assign-task',
		invalidateAll: false,
		multipleSubmits: 'allow',
		onUpdated: ({ form }) => settled(form.valid, form.message, 'Could not assign it.'),
		onError: () => void settled(false, undefined, 'Could not assign it.')
	});

	const { form: unassignData, enhance: unassignEnhance } = superForm(data.unassignForm, {
		id: 'unassign-task',
		invalidateAll: false,
		multipleSubmits: 'allow',
		onUpdated: ({ form }) => settled(form.valid, form.message, 'Could not change who is on it.'),
		onError: () => void settled(false, undefined, 'Could not change who is on it.')
	});

	/**
	 * What every card edit does when it comes back: the list is stale, or the
	 * card lied and the reader needs to know why. Only the list — `invalidate`
	 * by name rather than `invalidateAll()` (docs/data-invalidation.md).
	 */
	async function settled(valid: boolean, note: string | undefined, failed: string) {
		if (valid) await invalidate(QUERY.tasks);
		else toast.error(note ?? failed);
	}

	async function move(id: string, status: string) {
		if (!data.canMove) return;
		// The board hands back the status a release landed on, which is where
		// these statuses came from — but it is a string to the board, so it is
		// checked rather than cast before it becomes one.
		if (!isStatus(status)) return;
		pending.set(id, status);
		$moveData = { id, status };
		// The hidden inputs take the store's values on the next flush.
		await tick();
		moveFormEl?.requestSubmit();
	}

	function isStatus(value: string): value is Enums<'task_status'> {
		// SAFETY: `includes` needs the wider element type to accept an arbitrary
		// string; the check itself is what narrows, which is the point of the
		// guard — nothing is being asserted about `value`.
		return (TASK_STATUSES as readonly string[]).includes(value);
	}

	/**
	 * A day for a task, or none. The picker posts wall-clock time with no
	 * offset, which only the browser can resolve, so it becomes an instant here
	 * — the same rewrite `CreateRecord` does on the way out of its form.
	 */
	async function schedule(id: string, picked: string) {
		scheduling = null;
		const at = picked === '' ? null : new Date(picked);
		$scheduleData = { id, due_at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : '' };
		await tick();
		scheduleFormEl?.requestSubmit();
	}

	async function prioritize(id: string, priority: string) {
		if (!isPriority(priority)) return;
		$prioritizeData = { id, priority };
		await tick();
		prioritizeFormEl?.requestSubmit();
	}

	function isPriority(value: string): value is Enums<'priority'> {
		// SAFETY: the same narrowing guard as `isStatus` above, for the menu's
		// own value coming back as a string.
		return PRIORITY_OPTIONS.some((option) => option.value === value);
	}

	async function assign(id: string, userId: string) {
		$assignData = { id, user_id: userId };
		await tick();
		assignFormEl?.requestSubmit();
	}

	async function unassign(assignmentId: string) {
		$unassignData = { assignment_id: assignmentId };
		await tick();
		unassignFormEl?.requestSubmit();
	}

	/** The checkbox: finished, or back to the start of the board. */
	function toggleDone(task: Task) {
		void move(task.id, taskIsDone(task) ? 'todo' : 'done');
	}

	/** "3 tasks" — in the org's own word for them, singular when there is one. */
	function countLabel(n: number): string {
		return `${String(n)} ${n === 1 ? terms.noun : terms.plural}`;
	}

	/** An instant as `<input type="datetime-local">` wants it, in the reader's zone. */
	function toLocalInput(iso: string | null): string {
		if (!iso) return '';
		const at = new Date(iso);
		if (Number.isNaN(at.getTime())) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
	}

	/** Who is on a task now. Absent from the map means nobody. */
	function peopleOn(taskId: string): TaskAssignee[] {
		return data.assignees[taskId] ?? [];
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="task" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	{#if data.tasks.length === 0}
		<Empty.Root class="py-16">
			<Empty.Header>
				<Empty.Media variant="icon"><ListChecksIcon /></Empty.Media>
				<Empty.Title>Nothing to do yet</Empty.Title>
				<Empty.Description>
					A {terms.noun} is something with a name and, usually, a day by which it should be done. Add
					one and it lands in the first column.
				</Empty.Description>
			</Empty.Header>
			{#if data.canCreate}
				<Empty.Content>
					<CreateRecord type="task" form={data.createForm} />
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<Tabs.Root bind:value={view.current} class="gap-4">
			<Tabs.List>
				<Tabs.Trigger value="board"><ColumnsIcon class="size-4" />Board</Tabs.Trigger>
				<Tabs.Trigger value="list"><ListIcon class="size-4" />List</Tabs.Trigger>
			</Tabs.List>

			<!-- Both panels stay mounted (the inactive one merely `hidden`), so
			     each guards its content: without the check every task would be
			     drawn twice, and the board would register its drop zones while
			     it is off screen. -->
			<Tabs.Content value="board">
				{#if view.current === 'board'}{@render board()}{/if}
			</Tabs.Content>
			<Tabs.Content value="list">
				{#if view.current === 'list'}{@render list()}{/if}
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>

<!-- The forms every gesture posts through. Hidden, filled from the script. -->
<form method="POST" action="?/move" class="hidden" bind:this={moveFormEl} use:moveEnhance>
	<input type="hidden" name="id" value={$moveData.id} />
	<input type="hidden" name="status" value={$moveData.status} />
</form>
<form
	method="POST"
	action="?/schedule"
	class="hidden"
	bind:this={scheduleFormEl}
	use:scheduleEnhance
>
	<input type="hidden" name="id" value={$scheduleData.id} />
	<input type="hidden" name="due_at" value={$scheduleData.due_at} />
</form>
<form
	method="POST"
	action="?/prioritize"
	class="hidden"
	bind:this={prioritizeFormEl}
	use:prioritizeEnhance
>
	<input type="hidden" name="id" value={$prioritizeData.id} />
	<input type="hidden" name="priority" value={$prioritizeData.priority} />
</form>
<form method="POST" action="?/assign" class="hidden" bind:this={assignFormEl} use:assignEnhance>
	<input type="hidden" name="id" value={$assignData.id} />
	<input type="hidden" name="user_id" value={$assignData.user_id} />
</form>
<form
	method="POST"
	action="?/unassign"
	class="hidden"
	bind:this={unassignFormEl}
	use:unassignEnhance
>
	<input type="hidden" name="assignment_id" value={$unassignData.assignment_id} />
</form>

<!-- The board: one column per status GROUP, and inside a group that holds more
     than one status, a drop zone each — so a card dragged onto "In progress"
     is asked whether it is moving or stuck, rather than being guessed at. -->
{#snippet board()}
	<Kanban.Root onmove={move} disabled={!data.canMove}>
		{#each TASK_STATUS_GROUPS as group (group.id)}
			{@const cards = cardsOf(group)}
			<Kanban.Column value={group.id} label={group.label} statuses={group.statuses}>
				<Kanban.ColumnHeader tone={group.tone} count={cards.length}>
					{#snippet lead()}
						<Kanban.Ring
							tone={group.tone}
							fill={TASK_STATUS_RING[group.statuses[0].value]}
							class="size-4"
						/>
					{/snippet}
					{group.label}
				</Kanban.ColumnHeader>

				<Kanban.Zones>
					{#each group.statuses as status (status.value)}
						<Kanban.DropZone status={status.value} tone={TASK_STATUS_TONE[status.value]}>
							<Kanban.Ring
								tone={TASK_STATUS_TONE[status.value]}
								fill={TASK_STATUS_RING[status.value]}
								class="size-5"
							/>
							{status.label}
						</Kanban.DropZone>
					{/each}
				</Kanban.Zones>

				<Kanban.Cards>
					{#each cards as task (task.id)}
						{@render card(task)}
					{:else}
						<Kanban.Empty>No {terms.plural}</Kanban.Empty>
					{/each}
				</Kanban.Cards>
			</Kanban.Column>
		{/each}
	</Kanban.Root>
{/snippet}

<!-- One card. Its own status on the eyebrow — the column only said the group,
     so "Blocked" under "In progress" is news rather than the same word twice —
     then the title, what it is asking for, and who is on it. -->
{#snippet card(task: Task)}
	{@const people = peopleOn(task.id)}
	{@const comments = data.commentCounts[task.id] ?? 0}
	<Kanban.Card id={task.id} status={task.status} label={task.title}>
		<Kanban.CardHeader>
			<Kanban.Ring
				tone={TASK_STATUS_TONE[task.status]}
				fill={TASK_STATUS_RING[task.status]}
				class="size-3.5"
			/>
			<span class="truncate">{TASK_STATUS_LABEL[task.status]}</span>
		</Kanban.CardHeader>

		<Kanban.CardTitle href={recordHref('task', task.id)}>{task.title}</Kanban.CardTitle>

		{#if task.details}
			<p class="text-muted-foreground line-clamp-2 text-xs">{task.details}</p>
		{/if}

		<div class="flex flex-wrap items-center gap-1.5">
			{@render due(task)}
			{@render urgency(task)}
		</div>

		<Kanban.CardFooter>
			{@render assignees(task, people)}
			{#if comments > 0}
				<span class="text-muted-foreground flex items-center gap-1 text-xs tabular-nums">
					<MessageSquareIcon class="size-3.5" />
					{comments}
				</span>
			{/if}
		</Kanban.CardFooter>
	</Kanban.Card>
{/snippet}

<!-- When it is due. A chip that reads the date, and opens a picker when the
     reader may change it. -->
{#snippet due(task: Task)}
	{@const label = dueLabel(task, now)}
	{@const late = taskIsOverdue(task, now)}
	{#if data.canMove}
		<Popover.Root
			open={scheduling === task.id}
			onOpenChange={(open) => {
				scheduling = open ? task.id : null;
				if (open) dueDraft = toLocalInput(task.due_at);
			}}
		>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="xs"
						class={late ? 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400' : ''}
					>
						<CalendarIcon />
						{label ?? 'No due date'}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-72 space-y-3 p-3" align="start">
				<div class="space-y-1.5">
					<Label for="due-{task.id}">Due</Label>
					<Input id="due-{task.id}" type="datetime-local" bind:value={dueDraft} />
				</div>
				<div class="flex items-center justify-between gap-2">
					<Button variant="ghost" size="sm" onclick={() => schedule(task.id, '')}>Clear</Button>
					<Button size="sm" onclick={() => schedule(task.id, dueDraft)}>Save</Button>
				</div>
			</Popover.Content>
		</Popover.Root>
	{:else if label}
		<span
			class={late
				? 'text-xs font-medium text-red-600 dark:text-red-400'
				: 'text-muted-foreground text-xs'}
		>
			{label}
		</span>
	{/if}
{/snippet}

<!-- How urgent it is, in the app's one priority vocabulary: the same tone the
     pill in the list wears, as a menu of the same four options the create form
     offers. -->
{#snippet urgency(task: Task)}
	{#if data.canMove}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="xs">
						<span
							class="size-2 shrink-0 rounded-full {BADGE_TONE_DOT_CLASSES[
								PRIORITY_TONE[task.priority]
							]}"
						></span>
						{capitalize(task.priority)}
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-40">
				<DropdownMenu.RadioGroup
					value={task.priority}
					onValueChange={(value) => prioritize(task.id, value)}
				>
					{#each PRIORITY_OPTIONS as option (option.value)}
						<DropdownMenu.RadioItem value={option.value}>
							<span
								class="size-2 shrink-0 rounded-full {BADGE_TONE_DOT_CLASSES[
									PRIORITY_TONE[option.value]
								]}"
							></span>
							{option.label}
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else if task.priority !== 'normal'}
		<!-- Normal is what most things are, and a pill on every row saying so
		     is a pill that stops being read. -->
		<StatusBadge tone={PRIORITY_TONE[task.priority]} size="sm">
			{capitalize(task.priority)}
		</StatusBadge>
	{/if}
{/snippet}

<!-- Who is on it. Assignment is a relationship and a task can carry several,
     so this is a stack of people and a menu that adds or removes one — taking
     somebody off ends their row rather than deleting it (docs/tasks.md). -->
{#snippet assignees(task: Task, people: TaskAssignee[])}
	<div class="flex items-center gap-1">
		{#if people.length > 0}
			<div class="flex items-center">
				{#each people.slice(0, 3) as person (person.id)}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Avatar.Root {...props} class="ring-card -ml-1.5 size-6 ring-2 first:ml-0">
									<Avatar.Fallback class="{avatarTint(person.userId)} text-[10px] font-medium">
										{initialsOf(person.name)}
									</Avatar.Fallback>
								</Avatar.Root>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{person.name}</Tooltip.Content>
					</Tooltip.Root>
				{/each}
				{#if people.length > 3}
					<span
						class="bg-muted text-muted-foreground ring-card -ml-1.5 grid size-6 place-items-center rounded-full text-[10px] font-medium ring-2"
					>
						+{people.length - 3}
					</span>
				{/if}
			</div>
		{/if}

		{#if data.canMove}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-xs"
							class="text-muted-foreground rounded-full border border-dashed"
							aria-label="Who is on {task.title}"
						>
							<UserPlusIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-56">
					{#if people.length > 0}
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading>On it</DropdownMenu.GroupHeading>
							{#each people as person (person.id)}
								<DropdownMenu.Item onSelect={() => unassign(person.id)}>
									<Avatar.Root class="size-5">
										<Avatar.Fallback class="{avatarTint(person.userId)} text-[9px] font-medium">
											{initialsOf(person.name)}
										</Avatar.Fallback>
									</Avatar.Root>
									<span class="truncate">{person.name}</span>
									<span class="text-muted-foreground ml-auto text-xs">Remove</span>
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Group>
						<DropdownMenu.GroupHeading>Add someone</DropdownMenu.GroupHeading>
						{#each data.members.filter((member) => !people.some((p) => p.userId === member.userId)) as member (member.userId)}
							<DropdownMenu.Item onSelect={() => assign(task.id, member.userId)}>
								<Avatar.Root class="size-5">
									<Avatar.Fallback class="{avatarTint(member.userId)} text-[9px] font-medium">
										{initialsOf(member.name)}
									</Avatar.Fallback>
								</Avatar.Root>
								<span class="truncate">{member.name}</span>
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Item disabled>Everybody is already on it</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Group>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{:else if people.length === 0}
			<span class="text-muted-foreground text-xs">Unassigned</span>
		{/if}
	</div>
{/snippet}

{#snippet list()}
	<GroupList.Root>
		{#each TASK_BUCKETS as bucket (bucket)}
			{@const rows = piles[bucket]}
			<!-- A heading with nothing under it is a heading nobody needed. -->
			{#if rows.length > 0}
				<GroupList.Group open={bucket !== 'done'}>
					<GroupList.Header tone={TASK_BUCKET_TONE[bucket]} count={countLabel(rows.length)}>
						{TASK_BUCKET_LABEL[bucket]}
					</GroupList.Header>
					<GroupList.Items>
						{#each rows as task (task.id)}
							{@const done = taskIsDone(task)}
							<GroupList.Item muted={done}>
								{#snippet lead()}
									<Checkbox
										checked={done}
										disabled={!data.canMove || $submitting}
										aria-label={done ? `Reopen ${task.title}` : `Finish ${task.title}`}
										onCheckedChange={() => toggleDone(task)}
									/>
								{/snippet}
								<GroupList.ItemTitle href={recordHref('task', task.id)} struck={done}>
									{task.title}
								</GroupList.ItemTitle>
								{#if task.details}
									<p class="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
										{task.details}
									</p>
								{/if}
								<GroupList.ItemMeta>{@render chips(task)}</GroupList.ItemMeta>
							</GroupList.Item>
						{/each}
					</GroupList.Items>
				</GroupList.Group>
			{/if}
		{/each}
	</GroupList.Root>
{/snippet}

<!-- What a task says about itself in the list: where it sits, how much it is
     asking for, and when it is due. The board says the same three things, but
     as controls rather than pills — a row in a pile of "Overdue" is read, a
     card on the wall is worked on. -->
{#snippet chips(task: Task)}
	{@const label = dueLabel(task, now)}
	<div class="flex flex-wrap items-center gap-1.5">
		<StatusBadge tone={TASK_STATUS_TONE[task.status]} size="sm">
			{TASK_STATUS_LABEL[task.status]}
		</StatusBadge>
		{#if task.priority !== 'normal'}
			<StatusBadge tone={PRIORITY_TONE[task.priority]} size="sm">
				{capitalize(task.priority)}
			</StatusBadge>
		{/if}
		{#if label}
			<span
				class={taskIsOverdue(task, now)
					? 'text-xs font-medium text-red-600 dark:text-red-400'
					: 'text-muted-foreground text-xs'}
			>
				{label}
			</span>
		{/if}
	</div>
{/snippet}
