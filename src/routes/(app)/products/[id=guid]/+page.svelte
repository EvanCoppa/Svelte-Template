<script lang="ts">
	import { page } from '$app/state';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import ShareIcon from '@lucide/svelte/icons/share-2';
	import * as Detail from '$lib/components/detail/index.js';
	import EditRecord from '$lib/components/edit-record.svelte';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { noteCommands } from '$lib/notes-api';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';
	import ProductImage from './product-image.svelte';

	let { data } = $props();

	// What the industry calls a product — "Part" on a roof, "Item" at a shop.
	const terms = $derived(recordTerms(page.data.terms, 'product'));

	const facts = $derived(data.record.fields.filter((field) => field.value.type === 'link'));
	const details = $derived(data.record.fields.filter((field) => field.value.type !== 'link'));

	/** The note the button just made, so the caret lands in it. */
	let addedNoteId = $state<string | null>(null);

	async function addNote() {
		const note = await noteCommands.create({ entityType: 'product', entityId: data.record.id });
		if (note) addedNoteId = note.id;
	}

	let tab = $state('overview');

	const RECENT = 3;
	const recentActivities = $derived(data.activities.slice(0, RECENT));

	const queryKey = $derived(QUERY.record('product', data.record.id));

	let detailsOpen = $state(true);
	let notesOpen = $state(true);

	const canManageImage = $derived(data.edit?.canEdit ?? false);
</script>

<div class="space-y-6">
	<!-- The record: the way back, then who it is and how to reach it. -->
	<Detail.Header>
		<Detail.Back href={recordListHref('product')} label="All {terms.plural}" />
		<Detail.Identity
			id={data.record.id}
			name={data.record.name}
			pills={data.record.pills}
			tags={data.tags}
		>
			{#if facts.length > 0}
				<Detail.Facts>
					{#each facts as field (field.label)}
						{#if field.value.type === 'link'}
							<Detail.Fact icon={Detail.factIcon(field.value.href)}>
								<Detail.Value value={field.value} />
							</Detail.Fact>
						{/if}
					{/each}
				</Detail.Facts>
			{/if}
		</Detail.Identity>
		{#if data.edit?.canEdit}
			<Detail.HeaderActions>
				<EditRecord
					type={data.edit.type}
					recordId={data.record.id}
					form={data.edit.editForm}
					pickers={data.edit.editPickers}
				/>
			</Detail.HeaderActions>
		{/if}
	</Detail.Header>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<Tabs.Root bind:value={tab} variant="underline" class="gap-5">
			<Tabs.List>
				<Tabs.Trigger value="overview"><LayoutDashboardIcon />Overview</Tabs.Trigger>
				<Tabs.Trigger value="relationships">
					<ShareIcon />Relationships
					{@render count(data.relationships.length)}
				</Tabs.Trigger>
				<Tabs.Trigger value="activity">
					<ActivityIcon />Activity
					{@render count(data.activities.length)}
				</Tabs.Trigger>
				{#each data.related as group (group.kind)}
					{@const GroupIcon = iconFor(iconForPath(recordListHref(group.kind), page.data.nav ?? []))}
					<Tabs.Trigger value={group.kind}>
						<GroupIcon />{recordTerms(page.data.terms, group.kind).name}
						{@render count(group.records.length)}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			<Tabs.Content value="overview">
				{#if tab === 'overview'}{@render overview()}{/if}
			</Tabs.Content>

			<Tabs.Content value="relationships">
				{#if tab === 'relationships'}
					<Detail.Relationships
						relationships={data.relationships}
						typeOptions={data.relationshipTypeOptions}
						otherKinds={data.relationshipOtherKinds}
						canManage={data.canManageRelationships}
						form={data.relationshipForms.add}
						removeForm={data.relationshipForms.remove}
						graphHref={data.graphHref}
						noun={terms.noun}
						{queryKey}
					/>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="activity">
				{#if tab === 'activity'}
					<Card.Root>
						<Card.Header>
							<Card.Title>Activity</Card.Title>
							<Card.Description>
								Calls, emails, meetings and notes logged against this {terms.noun}, newest first.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<Detail.Timeline
								activities={data.activities}
								people={data.people}
								noun={terms.noun}
							/>
						</Card.Content>
					</Card.Root>
				{/if}
			</Tabs.Content>

			{#each data.related as group (group.kind)}
				<Tabs.Content value={group.kind}>
					{#if tab === group.kind}
						<Detail.RelatedGroup
							{group}
							terms={recordTerms(page.data.terms, group.kind)}
							noun={terms.noun}
						/>
					{/if}
				</Tabs.Content>
			{/each}
		</Tabs.Root>

		<Detail.Rail>
			<Detail.RailSection bind:open={detailsOpen} title="{capitalize(terms.noun)} details">
				{#snippet actions()}
					{#if data.edit?.canEdit}
						<EditRecord
							compact
							type={data.edit.type}
							recordId={data.record.id}
							form={data.edit.editForm}
							pickers={data.edit.editPickers}
						/>
					{/if}
				{/snippet}

				<dl class="space-y-3">
					{#each details as field (field.label)}
						<Detail.Field label={field.label} value={field.value} people={data.people} />
					{/each}
				</dl>

				{#if data.customFields.length > 0}
					<div class="space-y-3 border-t pt-5">
						<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Custom fields
						</p>
						<dl class="space-y-3">
							{#each data.customFields as field (field.key)}
								<Detail.Field label={field.label} value={field.value} />
							{/each}
						</dl>
					</div>
				{/if}

				<dl class="space-y-3 border-t pt-5">
					<Detail.Field
						label="Created"
						value={{ type: 'datetime', value: data.record.createdAt }}
					/>
					{#if data.record.createdBy}
						<Detail.Field
							label="Created by"
							value={{ type: 'person', userId: data.record.createdBy }}
							people={data.people}
						/>
					{/if}
					<Detail.Field
						label="Updated"
						value={{ type: 'datetime', value: data.record.updatedAt }}
					/>
					<div class="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-3">
						<dt class="text-muted-foreground truncate text-sm">ID</dt>
						<dd class="flex items-center gap-1">
							<code class="font-mono text-xs">{data.record.id.slice(0, 8)}…</code>
							<CopyButton value={data.record.id} label="Copy" copiedLabel="Copied" class="h-7" />
						</dd>
					</div>
				</dl>
			</Detail.RailSection>

			{#if data.notes}
				<Detail.RailSection bind:open={notesOpen} title="Notes" class="border-t pt-6">
					<Detail.Notes
						notes={data.notes}
						noun={terms.noun}
						autofocusId={addedNoteId}
						onadd={addNote}
						onsave={(id, patch) => noteCommands.save(id, patch)}
						onarchive={(id) => noteCommands.archive(id, true)}
					/>
				</Detail.RailSection>
			{/if}
		</Detail.Rail>
	</div>
</div>

<!-- How many a tab holds, after its name. -->
{#snippet count(n: number)}
	{#if n > 0}
		<span class="text-muted-foreground tabular-nums">{n}</span>
	{/if}
{/snippet}

<!--
	The storefront picture first — the reason this kind has a page of its own
	— then the latest of the timeline.
-->
{#snippet overview()}
	<div class="space-y-6">
		<ProductImage
			imageUrl={data.imageUrl}
			name={data.record.name}
			form={data.imageForm}
			removeForm={data.removeImageForm}
			canManage={canManageImage}
			{queryKey}
		/>

		<Card.Root>
			<Card.Header>
				<Card.Title>Recent activity</Card.Title>
				<Card.Description>The latest logged against this {terms.noun}.</Card.Description>
				{#if data.activities.length > RECENT}
					<Card.Action>
						<Button variant="ghost" size="sm" onclick={() => (tab = 'activity')}>View all</Button>
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				<Detail.Timeline activities={recentActivities} people={data.people} noun={terms.noun} />
			</Card.Content>
		</Card.Root>
	</div>
{/snippet}
