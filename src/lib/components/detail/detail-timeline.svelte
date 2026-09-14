<script lang="ts">
	import type { Tables } from '$lib/database.types';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import Activity from './detail-activity.svelte';

	let {
		activities,
		people,
		noun
	}: {
		activities: readonly Tables<'activities'>[];
		/** Who logged each entry, by user id — the page resolved the names. */
		people: ReadonlyMap<string, string>;
		/** What the record is called — "this quote". */
		noun: string;
	} = $props();
</script>

<!-- The timeline, whole or the first few entries the page passed. -->
{#if activities.length > 0}
	<ol data-slot="detail-timeline" class="space-y-5">
		{#each activities as item (item.id)}
			<Activity
				activity={item}
				author={item.author_id === null ? null : (people.get(item.author_id) ?? null)}
			/>
		{/each}
	</ol>
{:else}
	<Empty.Root class="p-6" data-slot="detail-timeline">
		<Empty.Header>
			<Empty.Title class="text-base">Nothing logged yet</Empty.Title>
			<Empty.Description>Interactions with this {noun} will show up here.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
