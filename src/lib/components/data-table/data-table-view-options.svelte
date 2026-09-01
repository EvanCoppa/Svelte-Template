<script lang="ts">
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import { UntitledButton } from '$lib/components/enhanced/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { useDataTable } from './context.svelte.js';

	let { class: className }: { class?: string } = $props();

	const dataTable = useDataTable();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<UntitledButton
				{...props}
				data-slot="data-table-view-options"
				color="secondary"
				size="xs"
				class={className}
			>
				{#snippet iconLeading()}<Settings2Icon />{/snippet}
				View
			</UntitledButton>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Toggle columns</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#each dataTable.table
				.getAllColumns()
				.filter((col) => typeof col.accessorFn !== 'undefined' && col.getCanHide()) as column (column.id)}
				<DropdownMenu.CheckboxItem
					class="capitalize"
					bind:checked={() => column.getIsVisible(), (v) => column.toggleVisibility(!!v)}
				>
					{column.id}
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
