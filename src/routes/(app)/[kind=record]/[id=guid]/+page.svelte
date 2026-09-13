<script lang="ts">
	import { page } from '$app/state';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import ImageIcon from '@lucide/svelte/icons/image';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ReceiptIcon from '@lucide/svelte/icons/receipt';
	import WaypointsIcon from '@lucide/svelte/icons/waypoints';
	import * as Detail from '$lib/components/detail/index.js';
	import EditRecord from '$lib/components/edit-record.svelte';
	import * as Note from '$lib/components/note/index.js';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { StatusBadge, TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { canArchiveNote, canEditNote } from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { QUERY } from '$lib/queries';
	import type { FieldValue } from '$lib/server/crm/records';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// What this kind is called, as the org's industry says it — "Quote", "All quotes".
	const terms = $derived(recordTerms(page.data.terms, data.record.kind));
	// The record wears its feature's icon — the one its sidebar entry carries,
	// found the way the breadcrumb trail finds it.
	const KindIcon = $derived(iconFor(iconForPath(page.url.pathname, page.data.nav ?? [])));

	/**
	 * The record's initials, for the avatar beside its name — the first letter
	 * of its first two words, the way the thread names a message's author.
	 */
	const initials = $derived(
		data.record.name
			.split(/\s+/)
			.filter((word) => word !== '')
			.slice(0, 2)
			.map((word) => word.charAt(0).toUpperCase())
			.join('')
	);

	/**
	 * The ways to reach the record — its email, phone and website — sit under
	 * its name as a row of quick facts, as a contact card would put them; the
	 * rest of the fields fill the Details grid. A `link` value already says it
	 * leads outside the app; the icon says by which door.
	 */
	const facts = $derived(data.record.fields.filter((field) => field.value.type === 'link'));
	const details = $derived(data.record.fields.filter((field) => field.value.type !== 'link'));

	function factIcon(href: string) {
		if (href.startsWith('mailto:')) return MailIcon;
		if (href.startsWith('tel:')) return PhoneIcon;
		return GlobeIcon;
	}

	/** Who logged an activity, or null when nobody can be named. */
	function author(userId: string | null): string | null {
		return userId === null ? null : (data.people.get(userId) ?? null);
	}

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
	 * The tabs below the details, in the order they are drawn: the overview
	 * and the timeline every kind has, then the sections only some kinds have
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
</script>

<div class="space-y-6">
	<!-- The record: who it is, its lifecycle, and what the page lets you do with it. -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex min-w-0 items-start gap-4">
			<Avatar.Root class="size-14 sm:size-16">
				<Avatar.Fallback
					class="{Avatar.avatarTint(data.record.id)} text-lg font-semibold sm:text-xl"
				>
					{initials}
				</Avatar.Fallback>
			</Avatar.Root>
			<div class="min-w-0 space-y-1.5">
				<p class="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
					<KindIcon class="size-4" />
					{capitalize(terms.noun)}
				</p>
				<div class="flex flex-wrap items-center gap-3">
					<h1 class="text-2xl font-bold tracking-tight">{data.record.name}</h1>
					{#each data.record.pills as pill (pill.label)}
						<StatusBadge tone={pill.tone}>{pill.label}</StatusBadge>
					{/each}
				</div>
				{#if facts.length > 0}
					<ul class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
						{#each facts as field (field.label)}
							{#if field.value.type === 'link'}
								{@const Icon = factIcon(field.value.href)}
								<li class="flex min-w-0 items-center gap-1.5">
									<Icon class="size-4 shrink-0" />
									<span class="truncate"><Detail.Value value={field.value} /></span>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
				{#if data.tags.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each data.tags as tag (tag.id)}
							<TagBadge tone={tag.tone}>{tag.name}</TagBadge>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<!-- Editing is the generic form the list page creates with, so the
			     fields, their validation and their words are described once —
			     drawn only for a kind it can write and a reader who may. -->
			{#if data.edit?.canEdit}
				<EditRecord
					type={data.edit.type}
					recordId={data.record.id}
					form={data.edit.editForm}
					pickers={data.edit.editPickers}
				/>
			{/if}
			{#if data.graphHref}
				<Button variant="outline" href={data.graphHref}>
					<WaypointsIcon />
					Open in graph
				</Button>
			{/if}

			<!-- The breadcrumb trail is the way back on a wide screen; this is the
			     way back everywhere else. -->
			<Button href={recordListHref(data.record.kind)} variant="outline">
				<ArrowLeftIcon />
				All {terms.plural}
			</Button>
		</div>
	</div>

	<!-- Details on the start side, the notes about it in a column beside them. -->
	<div class={['grid items-start gap-6', data.notes && 'xl:grid-cols-[minmax(0,1fr)_22rem]']}>
		<Card.Root>
			<Card.Header>
				<Card.Title>Details</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-6">
				<dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each details as field (field.label)}
						<Detail.Field label={field.label} value={field.value} people={data.people} />
					{/each}
				</dl>

				{#if data.customFields.length > 0}
					<div class="space-y-3 border-t pt-6">
						<p class="text-sm font-medium">Custom fields</p>
						<dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.customFields as field (field.key)}
								<Detail.Field label={field.label} value={field.value} />
							{/each}
						</dl>
					</div>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t">
				<dl class="flex flex-wrap items-center gap-x-6 gap-y-2">
					{@render stamp('Created', { type: 'datetime', value: data.record.createdAt })}
					{#if data.record.createdBy}
						{@render stamp('By', { type: 'person', userId: data.record.createdBy })}
					{/if}
					{@render stamp('Updated', { type: 'datetime', value: data.record.updatedAt })}
					<div class="flex items-center gap-2">
						<dt class="text-muted-foreground text-xs">ID</dt>
						<dd class="flex items-center gap-1">
							<code class="font-mono text-xs">{data.record.id.slice(0, 8)}…</code>
							<CopyButton value={data.record.id} label="Copy" copiedLabel="Copied" class="h-7" />
						</dd>
					</div>
				</dl>
			</Card.Footer>
		</Card.Root>

		{#if data.notes}
			{@const notes = data.notes}
			<Card.Root>
				<Card.Header>
					<Card.Title>Notes</Card.Title>
					<Card.Description>
						Written down about this {terms.noun}. Only visible to you — they don't show up on the
						dock or the notes page.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3">
					{#each notes.open as note (note.id)}
						<Note.Card color={note.color} class="h-40">
							<Note.Editor
								{note}
								editable={canEditNote(note, notes)}
								autofocus={note.id === addedNoteId}
								bodyClass="flex-1 field-sizing-fixed"
								onsave={(patch) => noteCommands.save(note.id, patch)}
							/>
							{#if canArchiveNote(note, notes)}
								<Note.Actions>
									<Note.Palette
										value={note.color}
										onpick={(color) => noteCommands.save(note.id, { color })}
									/>
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										title="Archive"
										onclick={() => noteCommands.archive(note.id, true)}
									>
										<ArchiveIcon class="size-4" />
										<span class="sr-only">Archive note</span>
									</Button>
								</Note.Actions>
							{/if}
						</Note.Card>
					{/each}

					{#if notes.canManage}
						<Button variant="outline" class="w-full" onclick={addNote}>
							<PlusIcon />
							New note
						</Button>
					{:else if notes.open.length === 0}
						<p class="text-muted-foreground text-sm">
							Nothing written down about this {terms.noun}.
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	<!-- Everything else about the record, one section at a time. Only the
	     active panel is drawn, so a form or a thread exists once. -->
	<Tabs.Root bind:value={tab} class="gap-4">
		<Tabs.List class="h-auto max-w-full flex-wrap">
			<Tabs.Trigger value="overview"><LayoutDashboardIcon />Overview</Tabs.Trigger>
			<Tabs.Trigger value="activity">
				<ActivityIcon />Activity
				{@render count(data.activities.length)}
			</Tabs.Trigger>
			{#if data.record.kind === 'company' || data.record.kind === 'contact'}
				<Tabs.Trigger value="addresses">
					<MapPinIcon />Addresses
					{@render count(data.addresses.length)}
				</Tabs.Trigger>
			{/if}
			{#if data.billing}
				<Tabs.Trigger value="billing"><ReceiptIcon />Billing</Tabs.Trigger>
			{/if}
			{#if data.record.kind === 'asset'}
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
					<Card.Content>{@render timeline(data.activities)}</Card.Content>
				</Card.Root>
			{/if}
		</Tabs.Content>
		{#if data.record.kind === 'company' || data.record.kind === 'contact'}
			<Tabs.Content value="addresses">
				{#if tab === 'addresses'}
					<Detail.Addresses
						addresses={data.addresses}
						form={data.addressForm}
						removeForm={data.removeAddressForm}
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
		{#if data.record.kind === 'asset'}
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
			{@const groupTerms = recordTerms(page.data.terms, group.kind)}
			<Tabs.Content value={group.kind}>
				{#if tab === group.kind}
					<Card.Root>
						<Card.Header>
							<Card.Title>{groupTerms.name}</Card.Title>
							<Card.Description>
								{group.records.length === 1
									? `One ${groupTerms.noun}`
									: `${String(group.records.length)} ${groupTerms.plural}`}
								linked to this {terms.noun}.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<ul class="divide-border divide-y">
								{#each group.records as record (record.id)}
									<Detail.Related {record} />
								{/each}
							</ul>
						</Card.Content>
					</Card.Root>
				{/if}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</div>

<!-- One of the stamps in the details footer: when it was made, by whom, when it changed. -->
{#snippet stamp(label: string, value: FieldValue)}
	<div class="flex items-center gap-2">
		<dt class="text-muted-foreground text-xs">{label}</dt>
		<dd class="text-xs"><Detail.Value {value} people={data.people} /></dd>
	</div>
{/snippet}

<!-- How many a tab holds, after its name. -->
{#snippet count(n: number)}
	{#if n > 0}
		<span class="text-muted-foreground tabular-nums">{n}</span>
	{/if}
{/snippet}

<!-- The timeline, whole or its first few entries. -->
{#snippet timeline(activities: typeof data.activities)}
	{#if activities.length > 0}
		<ol class="space-y-5">
			{#each activities as item (item.id)}
				<Detail.Activity activity={item} author={author(item.author_id)} />
			{/each}
		</ol>
	{:else}
		<Empty.Root class="p-6">
			<Empty.Header>
				<Empty.Title class="text-base">Nothing logged yet</Empty.Title>
				<Empty.Description>
					Interactions with this {terms.noun} will show up here.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
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

		{#if data.relationships.length > 0}
			<Card.Root>
				<Card.Header>
					<Card.Title>Relationships</Card.Title>
					<Card.Description>
						The records this {terms.noun} is linked to — who holds it, where it came from, who it refers
						to.
					</Card.Description>
					{#if data.graphHref}
						<Card.Action>
							<Button variant="outline" size="sm" href={data.graphHref}>
								<WaypointsIcon />
								Open in graph
							</Button>
						</Card.Action>
					{/if}
				</Card.Header>
				<Card.Content>
					<ul class="divide-border divide-y">
						{#each data.relationships as relationship (relationship.id)}
							<Detail.Relationship {relationship} />
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Recent activity</Card.Title>
				<Card.Description>
					The latest logged against this {terms.noun}.
				</Card.Description>
				{#if data.activities.length > RECENT}
					<Card.Action>
						<Button variant="ghost" size="sm" onclick={() => (tab = 'activity')}>View all</Button>
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>{@render timeline(recentActivities)}</Card.Content>
		</Card.Root>
	</div>
{/snippet}
