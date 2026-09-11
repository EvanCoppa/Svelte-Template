<script lang="ts">
	import type { LedgerEntry } from '$lib/crm/ledger';

	/**
	 * The "what" of a ledger row: an invoice by its number, or a payment by
	 * how it came in — with one line under it saying what it was for (the
	 * memo) or where it went (the invoice it settles, or "on account").
	 */
	let { entry }: { entry: LedgerEntry } = $props();
</script>

<div data-slot="ledger-entry-cell" class="min-w-0">
	{#if entry.kind === 'invoice'}
		{#if entry.href}
			<a href={entry.href} class="font-medium underline-offset-4 hover:underline">
				{entry.number}
			</a>
		{:else}
			<span class="font-medium">{entry.number}</span>
		{/if}
		{#if entry.memo}
			<p class="text-muted-foreground truncate text-xs">{entry.memo}</p>
		{/if}
	{:else}
		<span class="font-medium">
			{entry.direction === 'refund' ? 'Refund' : 'Payment'}
			<span class="text-muted-foreground font-normal">
				· {entry.method}{entry.reference ? ` ${entry.reference}` : ''}
			</span>
		</span>
		<p class="text-muted-foreground truncate text-xs">
			{#if entry.appliedTo}
				Applied to
				{#if entry.appliedTo.href}
					<a href={entry.appliedTo.href} class="underline-offset-4 hover:underline">
						{entry.appliedTo.number}
					</a>
				{:else}
					{entry.appliedTo.number}
				{/if}
			{:else}
				On account
			{/if}
			{#if entry.notes}
				· {entry.notes}
			{/if}
		</p>
	{/if}
</div>
