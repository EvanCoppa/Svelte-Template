<script lang="ts">
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import IdCardIcon from '@lucide/svelte/icons/id-card';
	import { page } from '$app/state';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import { avatarTint } from '$lib/components/ui/avatar/index.js';
	import { Badge, StatusBadge, TagBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { initialsOf } from '$lib/components/staff/member.js';
	import { RECORD_KIND_META, recordHref, recordTerms } from '$lib/crm/records';
	import Artifact from './assistant-artifact.svelte';

	/**
	 * One record, as `getRecord` returned it — the record page's header in
	 * miniature: the square tile of initials, the name with its lifecycle
	 * pills and tags, the first few fields as label-and-value rows, and how
	 * many records point at it. A door to the page when this session may open
	 * the kind (`terms` carries its feature exactly when it may — the sources
	 * rail's rule), plain otherwise.
	 *
	 * Compact on purpose: the model reads a record before most answers and
	 * before every edit, and three of these in one turn should read as
	 * receipts, not as three pages.
	 */
	type Output = Extract<
		AssistantToolUIPart,
		{ type: 'tool-getRecord'; state: 'output-available' }
	>['output'];

	let { output }: { output: Output } = $props();

	const record = $derived(output.record);
	/** The words for the kind, when the session may open it. */
	const feature = $derived(record ? RECORD_KIND_META[record.kind].feature : null);
	const terms = $derived(
		record && feature && page.data.terms?.[feature]
			? recordTerms(page.data.terms, record.kind)
			: null
	);
	const href = $derived(record && terms ? recordHref(record.kind, record.id) : null);

	/** How many fields the card shows before it stops; the page has the rest. */
	const MAX_FIELDS = 6;
	const fields = $derived(
		(record?.fields ?? []).filter((field) => field.value !== null).slice(0, MAX_FIELDS)
	);

	/** "3 deals · 2 tasks" — each group in the industry's words, only where the kind is on screen. */
	const related = $derived(
		output.related.flatMap((group) => {
			if (group.records.length === 0) return [];
			const groupFeature = RECORD_KIND_META[group.kind].feature;
			if (!page.data.terms?.[groupFeature]) return [];
			const words = recordTerms(page.data.terms, group.kind);
			const count = group.records.length;
			return [`${count} ${count === 1 ? words.noun : words.plural}`];
		})
	);
</script>

{#if record}
	<Artifact icon={IdCardIcon} title={terms?.noun ? terms.noun : record.kind} class="max-w-xl">
		{#snippet actions()}
			{#if href}
				<Button variant="ghost" size="xs" {href}>
					Open
					<ArrowUpRightIcon />
				</Button>
			{/if}
		{/snippet}

		<div class="flex items-start gap-3">
			<!-- Square, the way the record page draws it: a product is not a person. -->
			<div
				class="{avatarTint(
					record.id
				)} flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
			>
				{initialsOf(record.name)}
			</div>
			<div class="min-w-0 flex-1 space-y-2">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span class="truncate text-sm font-semibold">{record.name}</span>
					{#each record.status as pill (pill)}
						<StatusBadge size="sm">{pill}</StatusBadge>
					{/each}
					{#each record.tags as tag (tag)}
						<TagBadge>{tag}</TagBadge>
					{/each}
				</div>
				{#if fields.length > 0}
					<dl class="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
						{#each fields as field (field.label)}
							<dt class="text-muted-foreground truncate" title={field.label}>{field.label}</dt>
							<dd class="min-w-0 truncate">
								{#if field.record}
									<Badge variant="secondary" class="max-w-full truncate">{field.value}</Badge>
								{:else}
									{field.value}
								{/if}
							</dd>
						{/each}
					</dl>
				{/if}
				{#if related.length > 0}
					<p class="text-muted-foreground text-xs">{related.join(' · ')}</p>
				{/if}
			</div>
		</div>
	</Artifact>
{/if}
