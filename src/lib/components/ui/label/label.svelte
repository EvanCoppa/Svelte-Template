<script lang="ts">
	import { Label as LabelPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		required = false,
		children,
		...restProps
	}: LabelPrimitive.RootProps & {
		/** Appends the required marker; the field itself still carries `required`. */
		required?: boolean;
	} = $props();
</script>

<LabelPrimitive.Root
	bind:ref
	data-slot="label"
	class={cn(
		'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	{#if required}
		<!-- Pulled back against the text so it reads as a suffix, not a separate word. -->
		<span aria-hidden="true" class="text-primary -ms-1.5">*</span>
	{/if}
</LabelPrimitive.Root>
