<script lang="ts">
	import ColumnsIcon from '@lucide/svelte/icons/columns-3';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
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
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
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
		TASK_PRIORITY_TONE,
		TASK_STATUS_LABEL,
		TASK_STATUS_TONE,
		TASK_STATUSES,
		taskIsDone
	} from '$lib/crm/tones';
	import { createViewPreference } from '$lib/list-view.svelte';
	import { capitalize } from '$lib/utils.js';
	import { QUERY } from '$lib/queries';
	import type { Task } from '$lib/server/crm/tasks';
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

	const columns = $derived(groupTasksByStatus(tasks, TASK_STATUSES));
	const piles = $derived(groupTasksByBucket(tasks, now));

	let moveFormEl = $state<HTMLFormElement | null>(null);

	/**
	 * A card was dropped, carried across with the arrows, or its checkbox was
	 * ticked. A gesture has no form to post, so it fills the hidden one below
	 * and asks it to submit — the calendar's drag-to-move and the staff page's
	 * hold-to-remove take the same road, so a drag hits the same gate, the same
	 * RLS and the same `message()` on refusal as a form would.
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

	async function move(id: string, status: string) {
		if (!data.canMove) return;
		// The board hands back the column's own `value`, which is where these
		// columns came from — but it is a string to the board, so it is checked
		// rather than cast before it becomes a status.
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

	/** The checkbox: finished, or back to the start of the board. */
	function toggleDone(task: Task) {
		void move(task.id, taskIsDone(task) ? 'todo' : 'done');
	}

	/** "3 tasks" — in the org's own word for them, singular when there is one. */
	function countLabel(n: number): string {
		return `${String(n)} ${n === 1 ? terms.noun : terms.plural}`;
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

<!-- The form every move posts through. Hidden, filled from the script above. -->
<form method="POST" action="?/move" class="hidden" bind:this={moveFormEl} use:moveEnhance>
	<input type="hidden" name="id" value={$moveData.id} />
	<input type="hidden" name="status" value={$moveData.status} />
</form>

{#snippet board()}
	<Kanban.Root onmove={move} disabled={!data.canMove}>
		{#each TASK_STATUSES as status (status)}
			<Kanban.Column value={status} label={TASK_STATUS_LABEL[status]}>
				<Kanban.ColumnHeader tone={TASK_STATUS_TONE[status]} count={columns[status].length}>
					{TASK_STATUS_LABEL[status]}
				</Kanban.ColumnHeader>
				{#each columns[status] as task (task.id)}
					<Kanban.Card id={task.id} column={status} label={task.title}>
						<a
							href={recordHref('task', task.id)}
							class="font-medium underline-offset-4 hover:underline"
						>
							{task.title}
						</a>
						{#if task.details}
							<p class="text-muted-foreground line-clamp-2 text-xs">{task.details}</p>
						{/if}
						{@render chips(task, false)}
					</Kanban.Card>
				{:else}
					<Kanban.Empty>No {terms.plural}</Kanban.Empty>
				{/each}
			</Kanban.Column>
		{/each}
	</Kanban.Root>
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
								<GroupList.ItemMeta>{@render chips(task, true)}</GroupList.ItemMeta>
							</GroupList.Item>
						{/each}
					</GroupList.Items>
				</GroupList.Group>
			{/if}
		{/each}
	</GroupList.Root>
{/snippet}

<!-- What a task says about itself in both views, so a card and a row never
     disagree: how much it is asking for, and when it is due.
     `showStatus` is false on the board, where the column the card is sitting
     in has already said it — a card under "Blocked" wearing a "Blocked" pill
     is the same word twice. -->
{#snippet chips(task: Task, showStatus: boolean)}
	{@const due = dueLabel(task, now)}
	<div class="flex flex-wrap items-center gap-1.5">
		{#if showStatus}
			<StatusBadge tone={TASK_STATUS_TONE[task.status]} size="sm">
				{TASK_STATUS_LABEL[task.status]}
			</StatusBadge>
		{/if}
		<!-- Normal is what most things are, and a pill on every row saying so
		     is a pill that stops being read. -->
		{#if task.priority !== 'normal'}
			<StatusBadge tone={TASK_PRIORITY_TONE[task.priority]} size="sm">
				{capitalize(task.priority)}
			</StatusBadge>
		{/if}
		{#if due}
			<span
				class={taskIsOverdue(task, now)
					? 'text-xs font-medium text-red-600 dark:text-red-400'
					: 'text-muted-foreground text-xs'}
			>
				{due}
			</span>
		{/if}
	</div>
{/snippet}
