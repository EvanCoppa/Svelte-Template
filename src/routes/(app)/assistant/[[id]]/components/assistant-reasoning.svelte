<script lang="ts">
	import BrainIcon from '@lucide/svelte/icons/brain';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A `reasoning` part, folded away by default. Some models send an empty
	 * summary; then there is nothing to show and the part renders nothing.
	 */
	let {
		ref = $bindable(null),
		class: className,
		text,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		text: string;
	} = $props();

	let open = $state(false);
</script>

{#if text.trim()}
	<div bind:this={ref} data-slot="assistant-reasoning" class={cn(className)} {...restProps}>
		<Collapsible.Root bind:open>
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="text-muted-foreground -ml-2 h-7 gap-1.5"
					>
						<BrainIcon class="size-3.5" />
						Reasoning
						<ChevronDownIcon class={cn('size-3.5 transition-transform', open && 'rotate-180')} />
					</Button>
				{/snippet}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<p
					class="text-muted-foreground border-border mt-1 border-l-2 pl-3 text-sm whitespace-pre-wrap"
				>
					{text}
				</p>
			</Collapsible.Content>
		</Collapsible.Root>
	</div>
{/if}
