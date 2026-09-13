<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		'group-data-[variant=underline]/tabs:text-muted-foreground group-data-[variant=underline]/tabs:hover:text-foreground group-data-[variant=underline]/tabs:h-auto group-data-[variant=underline]/tabs:flex-none group-data-[variant=underline]/tabs:rounded-none group-data-[variant=underline]/tabs:border-0 group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:bg-transparent group-data-[variant=underline]/tabs:px-0 group-data-[variant=underline]/tabs:pt-1 group-data-[variant=underline]/tabs:pb-2.5',
		'group-data-[variant=underline]/tabs:data-[state=active]:border-foreground group-data-[variant=underline]/tabs:data-[state=active]:text-foreground group-data-[variant=underline]/tabs:data-[state=active]:bg-transparent group-data-[variant=underline]/tabs:data-[state=active]:shadow-none',
		className
	)}
	{...restProps}
/>
