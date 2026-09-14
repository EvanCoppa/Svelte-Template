<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import type { RelatedGroup } from '$lib/server/crm/records';
	import type { RecordTerms } from '$lib/crm/records';
	import Related from './detail-related.svelte';

	let {
		group,
		terms,
		noun
	}: {
		group: RelatedGroup;
		/** What the group's kind is called, as the org's industry says it. */
		terms: RecordTerms;
		/** What the record on screen is called — "linked to this quote". */
		noun: string;
	} = $props();
</script>

<!-- One group of records pointing at the record on screen. -->
<Card.Root data-slot="detail-related-group">
	<Card.Header>
		<Card.Title>{terms.name}</Card.Title>
		<Card.Description>
			{group.records.length === 1
				? `One ${terms.noun}`
				: `${String(group.records.length)} ${terms.plural}`}
			linked to this {noun}.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<ul class="divide-border divide-y">
			{#each group.records as record (record.id)}
				<Related {record} />
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
