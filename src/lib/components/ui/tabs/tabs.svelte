<script lang="ts" module>
	/**
	 * How a tab strip is painted. `pill` is the default segmented control;
	 * `underline` is the page-level strip — a full-width row on a hairline,
	 * the active tab marked by the rule under it — for a screen whose tabs
	 * are its main navigation rather than a control inside a card.
	 *
	 * The variant is declared once on the root and read by the list and the
	 * triggers through `group/tabs`, so a strip of ten tabs says it once.
	 */
	export type TabsVariant = 'pill' | 'underline';
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		variant = 'pill',
		class: className,
		...restProps
	}: TabsPrimitive.RootProps & { variant?: TabsVariant } = $props();
</script>

<TabsPrimitive.Root
	bind:ref
	bind:value
	data-slot="tabs"
	data-variant={variant}
	class={cn('group/tabs flex flex-col gap-2', className)}
	{...restProps}
/>
