<script lang="ts">
	import { page } from '$app/state';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ImageIcon from '@lucide/svelte/icons/image';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import ReceiptIcon from '@lucide/svelte/icons/receipt';
	import * as Detail from '$lib/components/detail/index.js';
	import EditRecord from '$lib/components/edit-record.svelte';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { noteCommands } from '$lib/notes-api';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// What this kind is called, as the org's industry says it — "Quote", "All quotes".
	const terms = $derived(recordTerms(page.data.terms, data.record.kind));

	/**
	 * The ways to reach the record — its email, phone and website — sit under
	 * its name as a row of quick facts; the rest of the fields fill the rail.
	 */
	const facts = $derived(data.record.fields.filter((field) => field.value.type === 'link'));
	const details = $derived(data.record.fields.filter((field) => field.value.type !== 'link'));

	/** The note the button just made, so the caret lands in it. */
	let addedNoteId = $state<string | null>(null);

	// A note written here is about this record: same table, same endpoint, same
	// editor as the dock — it is simply born attached.
	async function addNote() {
		const note = await noteCommands.create({
			entityType: data.record.kind,
			entityId: data.record.id
		});
		if (note) addedNoteId = note.id;
	}

	/**
	 * The tabs, which are most of the page: the overview (highlights,
	 * relationships and the latest activity) and the timeline every kind has,
	 * then the sections only some kinds have
	 * (a party's addresses, an invoice's money, an asset's photos, a task's
	 * conversation), then one tab per group of records pointing at this one.
	 * A related group's tab is keyed by its kind, so the overview can jump to it.
	 */
	let tab = $state('overview');

	// The overview's peek at the timeline; the Activity tab has all of it.
	const RECENT = 3;
	const recentActivities = $derived(data.activities.slice(0, RECENT));

	// Fixed locale, like every date on a page — see the staff page.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

	const queryKey = $derived(QUERY.record(data.record.kind, data.record.id));

	// The rail's two sections, open until this reader folds one away. Which is
	// open is this view's own business — nothing worth a preference or a cookie.
	let detailsOpen = $state(true);
	let notesOpen = $state(true);
</script>

<div class="space-y-6">
	<!-- The record: the way back, then who it is and how to reach it. -->
	<Detail.Header>
		<Detail.Back href={recordListHref(data.record.kind)} label="All {terms.plural}" />
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
	</Detail.Header>

	<!-- The tabs are the page; the rail beside them says what the record is and
	     holds the notes kept about it, whichever tab is open. -->
	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<!-- Everything else about the record, one section at a time. Only the
		     active panel is drawn, so a form or a thread exists once. -->
		<Tabs.Root bind:value={tab} variant="underline" class="gap-5">
			<Tabs.List>
				<Tabs.Trigger value="overview"><LayoutDashboardIcon />Overview</Tabs.Trigger>
				<Tabs.Trigger value="activity">
					<ActivityIcon />Activity
					{@render count(data.activities.length)}
				</Tabs.Trigger>
				{#if data.hasAddresses}
					<Tabs.Trigger value="addresses">
						<MapPinIcon />Addresses
						{@render count(data.addresses.length)}
					</Tabs.Trigger>
				{/if}
				{#if data.billing}
					<Tabs.Trigger value="billing"><ReceiptIcon />Billing</Tabs.Trigger>
				{/if}
				{#if data.hasImages}
					<Tabs.Trigger value="photos">
						<ImageIcon />Photos
						{@render count(data.images.length)}
					</Tabs.Trigger>
				{/if}
				{#if data.thread}
					<Tabs.Trigger value="conversation">
						<MessagesSquareIcon />Conversation
						{@render count(data.thread.messages.length)}
					</Tabs.Trigger>
				{/if}
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
			{#if data.hasAddresses}
				<Tabs.Content value="addresses">
					{#if tab === 'addresses'}
						<Detail.Addresses
							addresses={data.addresses}
							form={data.addressForm}
							removeForm={data.removeAddressForm}
							locateForm={data.locateAddressForm}
							canManage={data.canManageAddresses}
							noun={terms.noun}
							{queryKey}
						/>
					{/if}
				</Tabs.Content>
			{/if}
			{#if data.billing}
				{@const billing = data.billing}
				<Tabs.Content value="billing" class="space-y-6">
					{#if tab === 'billing'}
						<Detail.InvoiceLines
							invoiceId={data.record.id}
							status={billing.status}
							currency={billing.currency}
							totals={{
								subtotal: billing.subtotal,
								tax: billing.tax,
								shipping: billing.shipping,
								discount: billing.discount,
								total: billing.total,
								amountPaid: billing.amountPaid,
								balanceDue: billing.balanceDue
							}}
							lines={billing.lines}
							products={billing.products}
							lineForm={billing.forms.line}
							removeLineForm={billing.forms.removeLine}
							detailsForm={billing.forms.details}
							issueForm={billing.forms.issue}
							voidForm={billing.forms.void}
							removeForm={billing.forms.remove}
							canManage={billing.canManage}
							canDelete={billing.canDelete}
							noun={terms.noun}
							{queryKey}
						/>
						<Detail.InvoicePayments
							status={billing.status}
							currency={billing.currency}
							balanceDue={billing.balanceDue}
							payments={billing.payments}
							unapplied={billing.unapplied}
							paymentForm={billing.forms.payment}
							applyForm={billing.forms.applyPayment}
							removePaymentForm={billing.forms.removePayment}
							canRecord={billing.canRecordPayments}
							canRemove={billing.canRemovePayments}
							noun={terms.noun}
							{queryKey}
						/>
					{/if}
				</Tabs.Content>
			{/if}
			{#if data.hasImages}
				<Tabs.Content value="photos">
					{#if tab === 'photos'}
						<Detail.Images
							images={data.images}
							form={data.imageForm}
							removeForm={data.removeImageForm}
							canManage={data.canManageImages}
							noun={terms.noun}
							{queryKey}
						/>
					{/if}
				</Tabs.Content>
			{/if}
			{#if data.thread}
				{@const thread = data.thread}
				<Tabs.Content value="conversation">
					{#if tab === 'conversation'}
						<Detail.Thread
							messages={thread.messages}
							form={thread.form}
							removeForm={thread.removeForm}
							userId={thread.userId}
							canModerate={thread.canModerate}
							noun={terms.noun}
							{queryKey}
						/>
					{/if}
				</Tabs.Content>
			{/if}
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
					<!-- Editing is the generic form the list page creates with, so the
					     fields, their validation and their words are described once —
					     drawn only for a kind it can write and a reader who may. -->
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
	The summary: the highlights — the last thing that happened and how many
	records of each kind point here, each a door to its tab — then the
	relationships and the latest of the timeline.
-->
{#snippet overview()}
	<div class="space-y-6">
		<section class="space-y-3">
			<h2 class="text-sm font-medium">Highlights</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<button
					type="button"
					class="bg-card hover:bg-accent/50 rounded-xl border p-4 text-left transition-colors"
					onclick={() => (tab = 'activity')}
				>
					<p class="text-muted-foreground flex items-center gap-1.5 text-xs">
						<ActivityIcon class="size-3.5" />
						Last activity
					</p>
					{#if data.activities[0]}
						{@const latest = data.activities[0]}
						<p class="mt-1.5 truncate text-sm font-medium">
							{latest.subject ?? capitalize(latest.type)}
						</p>
						<p class="text-muted-foreground text-xs">
							{datetime.format(new Date(latest.occurred_at))}
						</p>
					{:else}
						<p class="text-muted-foreground mt-1.5 text-sm">Nothing logged yet</p>
					{/if}
				</button>
				{#each data.related as group (group.kind)}
					{@const groupTerms = recordTerms(page.data.terms, group.kind)}
					{@const GroupIcon = iconFor(iconForPath(recordListHref(group.kind), page.data.nav ?? []))}
					{@const first = group.records[0]}
					<button
						type="button"
						class="bg-card hover:bg-accent/50 rounded-xl border p-4 text-left transition-colors"
						onclick={() => (tab = group.kind)}
					>
						<p class="text-muted-foreground flex items-center gap-1.5 text-xs">
							<GroupIcon class="size-3.5" />
							{groupTerms.name}
						</p>
						<p class="mt-1.5 truncate text-sm font-medium">
							{#if first}{first.name}{/if}
							{#if group.records.length > 1}
								<span class="text-muted-foreground font-normal">
									+{group.records.length - 1}
								</span>
							{/if}
						</p>
						<p class="text-muted-foreground text-xs">
							{group.records.length === 1
								? `One ${groupTerms.noun}`
								: `${String(group.records.length)} ${groupTerms.plural}`}
						</p>
					</button>
				{/each}
			</div>
		</section>

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
