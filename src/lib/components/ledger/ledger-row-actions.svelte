<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	/**
	 * What a ledger row offers: taking a payment off the books, for a reader
	 * who holds `delete` on the ledger. An invoice row offers nothing here —
	 * its lifecycle is on its own page — and a reader without the grant gets
	 * no menu at all rather than an empty one.
	 */
	let {
		name,
		canDelete = false,
		onDelete
	}: {
		/** The entry this row is about — it names the trigger for screen readers. */
		name: string;
		canDelete?: boolean;
		onDelete: () => void;
	} = $props();
</script>

{#if canDelete}
	<div class="flex justify-end">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="size-8">
						<EllipsisIcon />
						<span class="sr-only">Actions for {name}</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item variant="destructive" onclick={onDelete}>
					<Trash2Icon />
					Remove
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
