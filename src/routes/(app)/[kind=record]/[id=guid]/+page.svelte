<script lang="ts">
	import { page } from '$app/state';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Detail from '$lib/components/detail/index.js';
	import * as Note from '$lib/components/note/index.js';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import { StatusBadge, TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { recordListHref, recordTerms } from '$lib/crm/records';
	import { canArchiveNote, canEditNote } from '$lib/notes';
	import { noteCommands } from '$lib/notes-api';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
	import { QUERY } from '$lib/queries';
	import { capitalize } from '$lib/utils.js';

	let { data } = $props();

	// What this kind is called, as the org's industry says it — "Quote", "All quotes".
	const terms = $derived(recordTerms(page.data.terms, data.record.kind));
	// The record wears its feature's icon — the one its sidebar entry carries,
	// found the way the breadcrumb trail finds it.
	const KindIcon = $derived(iconFor(iconForPath(page.url.pathname, page.data.nav ?? [])));

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
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-2">
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
			{#if data.tags.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each data.tags as tag (tag.id)}
						<TagBadge tone={tag.tone}>{tag.name}</TagBadge>
					{/each}
				</div>
			{/if}
		</div>

		<!-- The breadcrumb trail is the way back on a wide screen; this is the
		     way back everywhere else. -->
		<Button href={recordListHref(data.record.kind)} variant="outline">
			<ArrowLeftIcon />
			All {terms.plural}
		</Button>
	</div>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Details</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
						{#each data.record.fields as field (field.label)}
							<Detail.Field label={field.label} value={field.value} people={data.people} />
						{/each}
					</dl>
				</Card.Content>
			</Card.Root>

			{#if data.customFields.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Custom fields</Card.Title>
						<Card.Description>
							What this organization records about its {terms.plural} beyond the built-in columns.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
							{#each data.customFields as field (field.key)}
								<Detail.Field label={field.label} value={field.value} />
							{/each}
						</dl>
					</Card.Content>
				</Card.Root>
			{/if}

			{#if data.hasAddresses}
				<Detail.Addresses
					addresses={data.addresses}
					form={data.addressForm}
					removeForm={data.removeAddressForm}
					canManage={data.canManageAddresses}
					noun={terms.noun}
					queryKey={QUERY.record(data.record.kind, data.record.id)}
				/>
			{/if}

			{#if data.billing}
				{@const billing = data.billing}
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
					queryKey={QUERY.record(data.record.kind, data.record.id)}
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
					queryKey={QUERY.record(data.record.kind, data.record.id)}
				/>
			{/if}

			{#if data.hasImages}
				<Detail.Images
					images={data.images}
					form={data.imageForm}
					removeForm={data.removeImageForm}
					canManage={data.canManageImages}
					noun={terms.noun}
					queryKey={QUERY.record(data.record.kind, data.record.id)}
				/>
			{/if}

			{#if data.relationships.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Relationships</Card.Title>
						<Card.Description>
							The records this {terms.noun} is linked to — who holds it, where it came from, who it refers
							to.
						</Card.Description>
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

			{#if data.thread}
				{@const thread = data.thread}
				<Detail.Thread
					messages={thread.messages}
					form={thread.form}
					removeForm={thread.removeForm}
					userId={thread.userId}
					canModerate={thread.canModerate}
					noun={terms.noun}
					queryKey={QUERY.record(data.record.kind, data.record.id)}
				/>
			{/if}

			{#each data.related as group (group.kind)}
				{@const related = recordTerms(page.data.terms, group.kind)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{related.name}</Card.Title>
						<Card.Description>
							{group.records.length === 1
								? `One ${related.noun}`
								: `${String(group.records.length)} ${related.plural}`}
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
			{/each}
		</div>

		<aside class="space-y-6">
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

			<Card.Root>
				<Card.Header>
					<Card.Title>Activity</Card.Title>
					<Card.Description>
						Calls, emails, meetings and notes logged against this {terms.noun}, newest first.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.activities.length > 0}
						<ol class="space-y-5">
							{#each data.activities as activity (activity.id)}
								<Detail.Activity {activity} author={author(activity.author_id)} />
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
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Record</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="space-y-4">
						<Detail.Field
							label="Created"
							value={{ type: 'datetime', value: data.record.createdAt }}
						/>
						<Detail.Field
							label="Created by"
							value={data.record.createdBy
								? { type: 'person', userId: data.record.createdBy }
								: { type: 'empty' }}
							people={data.people}
						/>
						<Detail.Field
							label="Last updated"
							value={{ type: 'datetime', value: data.record.updatedAt }}
						/>
						<div class="space-y-1">
							<dt class="text-muted-foreground text-sm">ID</dt>
							<dd class="flex items-center justify-between gap-2">
								<code class="font-mono text-xs break-all">{data.record.id}</code>
								<CopyButton value={data.record.id} label="Copy" copiedLabel="Copied" class="h-8" />
							</dd>
						</div>
					</dl>
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
</div>
