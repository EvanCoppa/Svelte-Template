<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import type { HTMLAttributes } from 'svelte/elements';
	import { UntitledButton } from '$lib/components/enhanced/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The slice of TanStack's `Column` API this header drives. Structural on
	 * purpose: `renderComponent` erases a generic component's type parameters to
	 * their constraints, so a `Column<DataTableFeatures, TData, TValue>` prop
	 * would refuse every concretely-typed column at the call site. None of these
	 * members mention the row type, so any column from the features preset
	 * assigns without a cast.
	 */
	type HeaderColumn = {
		getCanSort: () => boolean;
		getIsSorted: () => false | 'asc' | 'desc';
		toggleSorting: (desc?: boolean, isMulti?: boolean) => void;
		getCanHide: () => boolean;
		toggleVisibility: (value?: boolean) => void;
	};

	let {
		ref = $bindable(null),
		column,
		title,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The column this header controls — handed in by the column def's `header` renderer. */
		column: HeaderColumn;
		title: string;
	} = $props();
</script>

{#if !column.getCanSort()}
	<div bind:this={ref} data-slot="data-table-column-header" class={className} {...restProps}>
		{title}
	</div>
{:else}
	<div
		bind:this={ref}
		data-slot="data-table-column-header"
		class={cn('flex items-center', className)}
		{...restProps}
	>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<UntitledButton
						{...props}
						color="tertiary"
						size="xs"
						class="data-[state=open]:bg-accent -ms-2.5"
					>
						{title}
						{#snippet iconTrailing()}
							{#if column.getIsSorted() === 'desc'}
								<ArrowDownIcon />
							{:else if column.getIsSorted() === 'asc'}
								<ArrowUpIcon />
							{:else}
								<ChevronsUpDownIcon />
							{/if}
						{/snippet}
					</UntitledButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				<DropdownMenu.Item onclick={() => column.toggleSorting(false)}>
					<ArrowUpIcon class="text-muted-foreground/70 me-2 size-3.5" />
					Asc
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => column.toggleSorting(true)}>
					<ArrowDownIcon class="text-muted-foreground/70 me-2 size-3.5" />
					Desc
				</DropdownMenu.Item>
				{#if column.getCanHide()}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={() => column.toggleVisibility(false)}>
						<EyeOffIcon class="text-muted-foreground/70 me-2 size-3.5" />
						Hide
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
