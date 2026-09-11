<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * One figure at the top of the ledger: what it is, and how much. The page
	 * formats the money and picks the tone — a red overdue figure is the
	 * page's judgement, not the tile's.
	 */
	let {
		label,
		value,
		class: className
	}: {
		label: string;
		/** Already formatted — the page knows the currency. */
		value: string;
		class?: string;
	} = $props();
</script>

<Card.Root data-slot="ledger-stat" class="gap-1 py-4">
	<Card.Header class="px-4">
		<Card.Description>{label}</Card.Description>
		<Card.Title class={cn('text-2xl font-semibold tabular-nums', className)}>{value}</Card.Title>
	</Card.Header>
</Card.Root>
