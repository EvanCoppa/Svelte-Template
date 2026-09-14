<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	/**
	 * The row menu every generic list page carries: Open, and Delete for a
	 * reader who holds the kind's `delete` grant. `href` is null when the
	 * reader may not open the row's kind (a view whose source feature is off
	 * for this org) — the menu still offers Delete alone rather than nothing.
	 */
	let {
		name,
		href,
		canDelete = false,
		onDelete
	}: {
		/** The record this row is about — it names the trigger for screen readers. */
		name: string;
		/** The record's own page; null when the reader may not open its kind. */
		href: string | null;
		canDelete?: boolean;
		onDelete?: () => void;
	} = $props();
</script>

<!-- No door and no grant: no menu at all rather than an empty one. -->
{#if href || canDelete}
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
				{#if href}
					<DropdownMenu.Item onclick={() => goto(href)}>
						<ExternalLinkIcon />
						Open
					</DropdownMenu.Item>
				{/if}
				{#if canDelete}
					{#if href}
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item variant="destructive" onclick={onDelete}>
						<Trash2Icon />
						Delete
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
