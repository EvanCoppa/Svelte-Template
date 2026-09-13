<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import ColumnsIcon from '@lucide/svelte/icons/columns-3';
	import HandshakeIcon from '@lucide/svelte/icons/handshake';
	import ListIcon from '@lucide/svelte/icons/list';
	import UserIcon from '@lucide/svelte/icons/user';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import CreateRecord from '$lib/components/create-record.svelte';
	import * as DataTable from '$lib/components/data-table/index.js';
	import * as Kanban from '$lib/components/kanban/index.js';
	import type { KanbanStatus } from '$lib/components/kanban/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { initialsOf } from '$lib/components/staff/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { avatarTint } from '$lib/components/ui/avatar/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import {
		closeLabel,
		dealIsSlipping,
		groupDealsByStage,
		stageFill,
		stageTotal
	} from '$lib/crm/deals';
	import { recordHref, recordTerms } from '$lib/crm/records';
	import { STAGE_OUTCOME_TONE } from '$lib/crm/tones';
	import { createListTable } from '$lib/lists/table';
	import { createViewPreference } from '$lib/list-view.svelte';
	import { QUERY } from '$lib/queries';
	import type { DealWithParties } from '$lib/server/crm/deals';
	import type { PageData } from './$types';

	let { data } = $props();

	/** One column's stage, as the load ships it. */
	type BoardStage = PageData['pipelines'][number]['stages'][number];

	const terms = $derived(recordTerms(page.data.terms, 'deal'));

	/**
	 * Board or list, remembered on this machine — the same two words, the same
	 * key shape and the same reason as `/tasks`: a board wants a wide screen and
	 * a list reads better on a narrow one, so this is the device's answer rather
	 * than the account's (docs/user-preferences.md).
	 */
	const view = createViewPreference('deals.view', ['board', 'list'] as const);

	// The list's columns, its search and its filters are the fields the org's
	// industry put on it (docs/lists.md); the page only composes the parts. Both
	// views are the same rows, read once: the list takes them described, the
	// board takes the columns themselves.
	const table = createListTable(
		() => data.list,
		() => page.data.terms
	);

	/**
	 * Which funnel is on screen — the load's answer, read out of the query
	 * string there (a stage only means something inside its own board, so a
	 * funnel draws one board at a time). The picker navigates rather than
	 * holding state of its own, exactly as the ledger's account filter does, so
	 * a link to a funnel is a link to that funnel.
	 */
	const board = $derived(data.pipelines.find((pipeline) => pipeline.id === data.boardId));

	const boardOptions = $derived(
		data.pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))
	);

	/** Show another board, keeping the rest of the URL. */
	function showBoard(id: string) {
		const url = new URL(page.url);
		url.searchParams.set('board', id);
		void goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	/**
	 * What one column holds: its stage, and the single-status array
	 * `Kanban.Column` registers — on this board a column IS a stage, so there is
	 * exactly one. A `$derived` rather than markup the board rebuilds on every
	 * render, which is what that prop asks for: it changes identity only when the
	 * stages themselves do, and a column re-registers itself when it does.
	 */
	const columns: { stage: BoardStage; statuses: KanbanStatus[] }[] = $derived(
		(board?.stages ?? []).map((stage) => ({
			stage,
			statuses: [{ value: stage.id, label: stage.name }]
		}))
	);

	/**
	 * Now, for the close-date labels. Read once per render rather than per card
	 * so every deal on screen is measured against the same instant — and in the
	 * reader's own zone, which is why it is not the server's.
	 */
	const now = $derived.by(() => {
		void data.deals;
		return new Date();
	});

	/** Moves in flight, so a dropped card stays where it landed while it saves. */
	const pending = new SvelteMap<string, string>();

	const deals = $derived(
		data.deals.map((deal) => {
			const to = pending.get(deal.id);
			if (to === undefined || to === deal.stage_id) return deal;
			const stage = board?.stages.find((candidate) => candidate.id === to);
			// A card reads its stage's outcome — it is what says whether the deal
			// is slipping or simply finished — so the optimistic copy carries the
			// stage it landed in rather than the one it left.
			return stage
				? {
						...deal,
						stage_id: stage.id,
						pipeline_stages: {
							id: stage.id,
							name: stage.name,
							outcome: stage.outcome,
							sort_order: stage.sortOrder
						}
					}
				: deal;
		})
	);

	const byStage = $derived(
		groupDealsByStage(
			deals,
			columns.map((column) => column.stage.id)
		)
	);

	let moveFormEl = $state<HTMLFormElement | null>(null);

	/**
	 * The move is a gesture — a card dropped, or carried with the arrow keys —
	 * and a gesture has no form of its own to post. So it fills the hidden form
	 * below and asks it to submit: the task board, the calendar's drag-to-move
	 * and the staff page's hold-to-remove take the same road, so a gesture hits
	 * the same gate, the same RLS and the same `message()` on refusal as a form.
	 */
	const { form: moveData, enhance: moveEnhance } = superForm(data.moveForm, {
		id: 'move-deal',
		invalidateAll: false,
		// Walking three deals down the funnel in a row is the normal case here.
		multipleSubmits: 'allow',
		async onUpdated({ form }) {
			const moved = form.data.id;
			if (form.valid) {
				// Only the list — `invalidate` by name rather than `invalidateAll()`
				// (docs/data-invalidation.md).
				await invalidate(QUERY.deals);
			} else {
				toast.error(form.message ?? `Could not move the ${terms.noun}.`);
			}
			// Only if a later move of the same deal has not replaced it.
			if (pending.get(moved) === form.data.stage_id) pending.delete(moved);
		},
		onError() {
			toast.error(`Could not move the ${terms.noun}.`);
			pending.clear();
		}
	});

	async function move(id: string, stageId: string) {
		if (!data.canMove) return;
		// The board hands back the status a release landed on, which on this
		// board is a stage id — but it is a string to the board, so it is checked
		// against this board's own stages rather than trusted.
		if (!columns.some((column) => column.stage.id === stageId)) return;
		pending.set(id, stageId);
		$moveData = { id, stage_id: stageId };
		// The hidden inputs take the store's values on the next flush.
		await tick();
		moveFormEl?.requestSubmit();
	}

	// The app's one way to write money, and a fixed locale so the server render
	// and the hydrated one agree. Deals carry no currency of their own yet.
	const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	/** Who a deal is with: the company it belongs to, else the person on their own. */
	function party(deal: DealWithParties): { name: string; company: boolean } | null {
		if (deal.companies) return { name: deal.companies.name, company: true };
		if (deal.contacts) return { name: deal.contacts.name, company: false };
		return null;
	}

	/** Who it is assigned to, named by the roster. A deal is one person's. */
	function owner(deal: DealWithParties): { userId: string; name: string } | null {
		if (!deal.assigned_to) return null;
		const assigned = deal.assigned_to;
		return data.members.find((member) => member.userId === assigned) ?? null;
	}
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.canCreate}
			<PageHeader.Actions>
				<CreateRecord type="deal" form={data.createForm} />
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	{#if data.deals.length === 0}
		<Empty.Root class="py-16">
			<Empty.Header>
				<Empty.Media variant="icon"><HandshakeIcon /></Empty.Media>
				<Empty.Title>No {terms.plural} yet</Empty.Title>
				<Empty.Description>
					A {terms.noun} is a piece of business you are working towards, somewhere on the board. Add one
					and it lands in the first stage.
				</Empty.Description>
			</Empty.Header>
			{#if data.canCreate}
				<Empty.Content>
					<CreateRecord type="deal" form={data.createForm} />
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<Tabs.Root bind:value={view.current} class="gap-4">
			<Tabs.List>
				<Tabs.Trigger value="board"><ColumnsIcon class="size-4" />Board</Tabs.Trigger>
				<Tabs.Trigger value="list"><ListIcon class="size-4" />List</Tabs.Trigger>
			</Tabs.List>

			<!-- Both panels stay mounted (the inactive one merely `hidden`), so each
			     guards its content: without the check every deal would be drawn
			     twice, the board would register its drop zones while it is off
			     screen, and the table would measure its page size against a box
			     that is not on the page. -->
			<Tabs.Content value="board">
				{#if view.current === 'board'}{@render funnel()}{/if}
			</Tabs.Content>
			<Tabs.Content value="list">
				{#if view.current === 'list'}{@render list()}{/if}
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>

<!-- The form the move posts through. Hidden, filled from the script. -->
<form method="POST" action="?/move" class="hidden" bind:this={moveFormEl} use:moveEnhance>
	<input type="hidden" name="id" value={$moveData.id} />
	<input type="hidden" name="stage_id" value={$moveData.stage_id} />
</form>

<!-- The funnel: one column per stage of one board. A stage IS the state a deal
     is in, so every column holds exactly one and a release lands straight away
     — the task board's drop zones are for columns that group several states. -->
{#snippet funnel()}
	{#if board === undefined}
		<Empty.Root class="py-16">
			<Empty.Header>
				<Empty.Media variant="icon"><ColumnsIcon /></Empty.Media>
				<Empty.Title>No board to draw</Empty.Title>
				<Empty.Description>
					A funnel is a pipeline's stages, and this organization has none. The list still shows
					every {terms.noun}.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="space-y-4">
			{#if boardOptions.length > 1}
				<Combobox
					value={board.id}
					options={boardOptions}
					onchange={showBoard}
					size="sm"
					class="w-56"
					ariaLabel="Which board"
				/>
			{/if}

			<Kanban.Root onmove={move} disabled={!data.canMove}>
				{#each columns as column (column.stage.id)}
					{@const stage = column.stage}
					{@const cards = byStage[stage.id]}
					{@const tone = STAGE_OUTCOME_TONE[stage.outcome]}
					<Kanban.Column value={stage.id} label={stage.name} statuses={column.statuses}>
						<Kanban.ColumnHeader {tone} count={cards.length}>
							{#snippet lead()}
								<Kanban.Ring {tone} fill={stageFill(stage)} class="size-4" />
							{/snippet}
							{stage.name}
							{#snippet actions()}
								<!-- What the stage is worth. The reason a funnel is drawn as one
								     rather than listed: the shape of the money in it. An empty
								     column says nothing — the count beside it already said zero. -->
								{#if cards.length > 0}
									<span class="text-muted-foreground text-xs tabular-nums">
										{usd.format(stageTotal(cards))}
									</span>
								{/if}
							{/snippet}
						</Kanban.ColumnHeader>

						<Kanban.Cards>
							{#each cards as deal (deal.id)}
								{@render card(deal)}
							{:else}
								<Kanban.Empty>No {terms.plural}</Kanban.Empty>
							{/each}
						</Kanban.Cards>
					</Kanban.Column>
				{/each}
			</Kanban.Root>
		</div>
	{/if}
{/snippet}

<!-- One card. The column already said the stage, so the eyebrow says who the
     deal is with instead — which is what a funnel is read for — then the title,
     what it is worth, when it is meant to close, and whose it is. -->
{#snippet card(deal: DealWithParties)}
	{@const counterparty = party(deal)}
	{@const closes = closeLabel(deal, now)}
	{@const slipping = dealIsSlipping(deal, now)}
	{@const assignee = owner(deal)}
	<Kanban.Card id={deal.id} status={deal.stage_id} label={deal.title}>
		<Kanban.CardHeader>
			{#if counterparty}
				{#if counterparty.company}
					<Building2Icon class="size-3.5 shrink-0" />
				{:else}
					<UserIcon class="size-3.5 shrink-0" />
				{/if}
				<span class="truncate">{counterparty.name}</span>
			{:else}
				<span class="truncate italic">Nobody attached yet</span>
			{/if}
		</Kanban.CardHeader>

		<Kanban.CardTitle href={recordHref('deal', deal.id)}>{deal.title}</Kanban.CardTitle>

		<!-- A deal with neither a figure nor a date says nothing here rather than
		     holding an empty line open. -->
		{#if deal.amount !== null || closes}
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if deal.amount !== null}
					<span class="font-medium tabular-nums">{usd.format(deal.amount)}</span>
				{/if}
				{#if closes}
					<span
						class={slipping
							? 'text-xs font-medium text-red-600 dark:text-red-400'
							: 'text-muted-foreground text-xs'}
					>
						{closes}
					</span>
				{/if}
			</div>
		{/if}

		<Kanban.CardFooter>
			{#if assignee}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Avatar.Root {...props} class="size-6">
								<Avatar.Fallback class="{avatarTint(assignee.userId)} text-[10px] font-medium">
									{initialsOf(assignee.name)}
								</Avatar.Fallback>
							</Avatar.Root>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{assignee.name}</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<span class="text-muted-foreground text-xs">Unassigned</span>
			{/if}
		</Kanban.CardFooter>
	</Kanban.Card>
{/snippet}

{#snippet list()}
	<DataTable.Root {table}>
		<DataTable.Toolbar>
			<DataTable.Search placeholder="Search {terms.plural}…" ariaLabel="Search {terms.plural}" />
			<DataTable.Filters />
			<DataTable.ViewOptions class="ms-auto" />
		</DataTable.Toolbar>
		<DataTable.Content emptyMessage="No {terms.plural} match." />
		<DataTable.Pagination noun={terms.noun} nounPlural={terms.plural} />
	</DataTable.Root>
{/snippet}
