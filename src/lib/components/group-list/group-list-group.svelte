<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * One heading and what is under it. Open by default, because a list that
	 * arrives shut is a list you have to open before you can read it; a page
	 * that wants a group closed says so with `bind:open`.
	 */
	let {
		ref = $bindable(null),
		open = $bindable(true),
		class: className,
		children,
		...restProps
	}: CollapsiblePrimitive.RootProps = $props();
</script>

<Collapsible.Root
	bind:ref
	bind:open
	data-slot="group-list-group"
	class={cn('bg-card overflow-hidden rounded-xl border', className)}
	{...restProps}
>
	{@render children?.()}
</Collapsible.Root>
