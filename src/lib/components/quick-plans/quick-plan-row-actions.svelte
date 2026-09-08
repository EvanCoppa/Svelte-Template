<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		name,
		canEdit = false,
		canDelete = false,
		onEdit,
		onDelete
	}: {
		/** The bundle this row is about — it names the trigger for screen readers. */
		name: string;
		canEdit?: boolean;
		canDelete?: boolean;
		onEdit: () => void;
		onDelete: () => void;
	} = $props();
</script>

<!-- A reader with neither permission gets no menu at all rather than an empty one. -->
{#if canEdit || canDelete}
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
				{#if canEdit}
					<DropdownMenu.Item onclick={onEdit}>
						<PencilIcon />
						Edit
					</DropdownMenu.Item>
				{/if}
				{#if canDelete}
					{#if canEdit}
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
