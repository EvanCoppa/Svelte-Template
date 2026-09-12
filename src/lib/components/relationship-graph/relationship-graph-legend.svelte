<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { Swatch } from '$lib/crm/graph';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * One legend: a heading and a row per entry — a checkbox that shows or
	 * hides it on the map, its swatch where the entries are coloured (the
	 * kinds; the relationship types are not), its name as the page named
	 * it, and how many there are. Nothing here names or counts anything: the
	 * page arrives with the entries as the server described them and owns
	 * which are shown.
	 */
	let {
		ref = $bindable(null),
		class: className,
		title,
		items,
		ontoggle,
		...restProps
	}: // `ontoggle` is ours, not the DOM's popover event: nothing here is a popover.
	WithElementRef<Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'ontoggle'>> & {
		title: string;
		items: readonly {
			id: string;
			label: string;
			count: number;
			checked: boolean;
			swatch?: Swatch;
		}[];
		ontoggle: (id: string) => void;
	} = $props();

	// Checkbox ids must be unique per legend on a page that draws two.
	const prefix = $props.id();
</script>

<div
	bind:this={ref}
	data-slot="relationship-graph-legend"
	class={cn('space-y-2', className)}
	{...restProps}
>
	<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</p>
	<ul class="space-y-1.5">
		{#each items as item (item.id)}
			{@const id = `${prefix}-${item.id}`}
			<li class="flex items-center gap-2">
				<Checkbox {id} checked={item.checked} onCheckedChange={() => ontoggle(item.id)} />
				{#if item.swatch}
					<span
						aria-hidden="true"
						class="size-2.5 shrink-0 rounded-full"
						style:background-color={`var(--${item.swatch})`}
					></span>
				{/if}
				<Label for={id} class="min-w-0 flex-1 cursor-pointer truncate font-normal"
					>{item.label}</Label
				>
				<span class="text-muted-foreground text-xs tabular-nums">{item.count}</span>
			</li>
		{/each}
	</ul>
</div>
