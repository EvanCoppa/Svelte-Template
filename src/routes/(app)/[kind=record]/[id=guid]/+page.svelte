<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import * as Detail from '$lib/components/detail/index.js';
	import { CopyButton } from '$lib/components/enhanced/index.js';
	import { StatusBadge, TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { RECORD_KIND_META, recordListHref } from '$lib/crm/records';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';

	let { data } = $props();

	const meta = $derived(RECORD_KIND_META[data.record.kind]);
	// The record wears its feature's icon — the one its sidebar entry carries,
	// found the way the breadcrumb trail finds it.
	const KindIcon = $derived(iconFor(iconForPath(page.url.pathname, page.data.nav ?? [])));

	/** Who logged an activity, or null when nobody can be named. */
	function author(userId: string | null): string | null {
		return userId === null ? null : (data.people.get(userId) ?? null);
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-2">
			<p class="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
				<KindIcon class="size-4" />
				{meta.noun}
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
			All {meta.nounPlural.toLowerCase()}
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
							What this organization records about its {meta.nounPlural.toLowerCase()} beyond the built-in
							columns.
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

			{#if data.addresses.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Addresses</Card.Title>
					</Card.Header>
					<Card.Content class="grid gap-3 sm:grid-cols-2">
						{#each data.addresses as address (address.id)}
							<address class="border-border space-y-1.5 rounded-lg border p-3 text-sm not-italic">
								<div class="flex items-center gap-2">
									<TagBadge tone={address.is_primary ? 'info' : 'neutral'} class="capitalize">
										{address.kind}
									</TagBadge>
									{#if address.label}
										<span class="text-muted-foreground truncate text-xs">{address.label}</span>
									{/if}
								</div>
								<p>{address.line1}</p>
								{#if address.line2}
									<p>{address.line2}</p>
								{/if}
								<p>
									{[address.city, address.region].filter(Boolean).join(', ')}
									{address.postal_code ?? ''}
								</p>
								{#if address.country}
									<p class="text-muted-foreground">{address.country}</p>
								{/if}
							</address>
						{/each}
					</Card.Content>
				</Card.Root>
			{/if}

			{#each data.related as group (group.kind)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{RECORD_KIND_META[group.kind].nounPlural}</Card.Title>
						<Card.Description>
							{group.records.length === 1
								? `One ${RECORD_KIND_META[group.kind].noun.toLowerCase()}`
								: `${String(group.records.length)} ${RECORD_KIND_META[group.kind].nounPlural.toLowerCase()}`}
							linked to this {meta.noun.toLowerCase()}.
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
			<Card.Root>
				<Card.Header>
					<Card.Title>Activity</Card.Title>
					<Card.Description>
						Calls, emails, meetings and notes logged against this {meta.noun.toLowerCase()}, newest
						first.
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
									Interactions with this {meta.noun.toLowerCase()} will show up here.
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
