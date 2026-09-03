<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import CheckIcon from '@lucide/svelte/icons/check';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<!--
	Both indicators stay mounted and animate on the root's data-state, so a
	check draws itself in (stroke-dashoffset) and scales up instead of popping.
	Reduced motion collapses the transitions and shows the finished stroke.
-->
<CheckboxPrimitive.Root
	bind:ref
	data-slot="checkbox"
	class={cn(
		'border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive group/checkbox peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-[background-color,border-color,box-shadow] duration-150 ease-out outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	bind:checked
	bind:indeterminate
	{...restProps}
>
	<div
		data-slot="checkbox-indicator"
		class="relative flex size-3.5 items-center justify-center text-current"
	>
		<CheckIcon
			class="size-3.5 scale-50 opacity-0 transition-[stroke-dashoffset,transform,opacity] duration-200 ease-out [stroke-dasharray:24] [stroke-dashoffset:24] group-data-[state=checked]/checkbox:scale-100 group-data-[state=checked]/checkbox:opacity-100 group-data-[state=checked]/checkbox:[stroke-dashoffset:0] motion-reduce:transition-none motion-reduce:[stroke-dashoffset:0]"
		/>
		<MinusIcon
			class="absolute size-3.5 scale-50 opacity-0 transition-[transform,opacity] duration-150 ease-out group-data-[state=indeterminate]/checkbox:scale-100 group-data-[state=indeterminate]/checkbox:opacity-100 motion-reduce:transition-none"
		/>
	</div>
</CheckboxPrimitive.Root>
