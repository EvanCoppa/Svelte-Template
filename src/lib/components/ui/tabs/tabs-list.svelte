<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<!-- The `underline` overrides win on specificity: they carry the root's
     attribute as well as this element's. See `TabsVariant`. -->
<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn(
		'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]',
		'group-data-[variant=underline]/tabs:h-auto group-data-[variant=underline]/tabs:w-full group-data-[variant=underline]/tabs:justify-start group-data-[variant=underline]/tabs:gap-5 group-data-[variant=underline]/tabs:overflow-x-auto group-data-[variant=underline]/tabs:rounded-none group-data-[variant=underline]/tabs:border-b group-data-[variant=underline]/tabs:bg-transparent group-data-[variant=underline]/tabs:p-0',
		className
	)}
	{...restProps}
/>
