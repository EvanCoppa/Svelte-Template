<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';

	/**
	 * A row's picture as a thumbnail — rendered through
	 * `DataTable.imageCell()` for an `image` field (docs/lists.md).
	 *
	 * Decorative on purpose: the record's name is a link in the same row, so
	 * an alt text here would only make a screen reader read every row twice.
	 * A record with no picture gets the same square in muted tones rather than
	 * a dash, so the column stays a column instead of a ragged edge — and both
	 * states are exactly one row-height tall, so the page-size probe measures a
	 * consistent row (`page-size.ts`).
	 */
	let { url }: { url: string | null } = $props();
</script>

{#if url}
	<img
		data-slot="data-table-image-cell"
		src={url}
		alt=""
		loading="lazy"
		decoding="async"
		class="border-border/60 bg-muted size-9 rounded-md border object-cover"
	/>
{:else}
	<div
		data-slot="data-table-image-cell"
		class="border-border/60 bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-md border border-dashed"
	>
		<ImageIcon class="size-4" aria-hidden="true" />
	</div>
{/if}
