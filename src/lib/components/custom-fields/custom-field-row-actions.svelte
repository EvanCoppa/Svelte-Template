<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		label,
		canManage = false,
		onEdit,
		onDelete
	}: {
		/** The field this row is about — it names the trigger for screen readers. */
		label: string;
		canManage?: boolean;
		onEdit: () => void;
		onDelete: () => void;
	} = $props();
</script>

<!-- Declaring fields is one permission, so the menu is all of it or none. -->
{#if canManage}
	<div class="flex justify-end">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="size-8">
						<EllipsisIcon />
						<span class="sr-only">Actions for {label}</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={onEdit}>
					<PencilIcon />
					Edit
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onclick={onDelete}>
					<Trash2Icon />
					Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
