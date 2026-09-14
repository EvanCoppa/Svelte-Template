<script lang="ts">
	import { getToolName } from 'ai';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { HTMLAttributes } from 'svelte/elements';
	import { toolLabel } from '$lib/ai/labels';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { motionTransition } from '$lib/motion.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * What the assistant did on the way to its answer, as one line rather than
	 * a stack of cards. While tools are still running only the newest is
	 * named, and each one that supersedes it flips up into its place; once
	 * they have all finished the line collapses to a count, and opening it
	 * lists what ran.
	 *
	 * A call waiting on the reader is not activity — it is a question — so the
	 * message keeps those as cards and never hands them here.
	 */
	let {
		ref = $bindable(null),
		class: className,
		parts,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		parts: AssistantToolUIPart[];
	} = $props();

	const running = $derived(
		parts.some((part) => part.state === 'input-streaming' || part.state === 'input-available')
	);
	const liveIndex = $derived(parts.length - 1);
	const liveLabel = $derived(liveIndex >= 0 ? toolLabel(getToolName(parts[liveIndex]), false) : '');

	// Keying the live line on that index is what makes one tool leave upwards
	// as the next arrives from below. The animating goes through `$lib/motion`,
	// which is where `prefers-reduced-motion` is honoured: asked for less
	// motion, the line simply fades.
	const FLIP = { duration: 0.24, ease: 'easeOut' } as const;
	const FLIP_IN = {
		keyframes: { opacity: [0, 1], y: [14, 0] },
		transition: FLIP,
		reduced: { keyframes: { opacity: [0, 1] }, transition: FLIP }
	};
	const FLIP_OUT = {
		keyframes: { opacity: [1, 0], y: [0, -14] },
		transition: FLIP,
		reduced: { keyframes: { opacity: [1, 0] }, transition: FLIP }
	};

	let open = $state(false);

	function failed(part: AssistantToolUIPart): boolean {
		return part.state === 'output-error';
	}
</script>

{#if parts.length > 0}
	<div bind:this={ref} data-slot="assistant-activity" class={cn(className)} {...restProps}>
		{#if running}
			<div class="relative h-5 overflow-hidden">
				{#key liveIndex}
					<div
						class="text-muted-foreground absolute inset-0 flex items-center gap-2 text-xs"
						in:motionTransition={FLIP_IN}
						out:motionTransition={FLIP_OUT}
					>
						<Spinner class="size-3.5" />
						<span>{liveLabel}…</span>
					</div>
				{/key}
			</div>
		{:else}
			<Collapsible.Root bind:open>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="sm"
							class="text-muted-foreground hover:text-foreground -ml-2 h-7 gap-1.5 text-xs font-normal"
						>
							{#if parts.some(failed)}
								<TriangleAlertIcon class="size-3.5 text-amber-500 dark:text-amber-400" />
							{:else}
								<CheckIcon class="size-3.5 text-emerald-600 dark:text-emerald-400" />
							{/if}
							{parts.length} tool{parts.length === 1 ? '' : 's'} called
							<ChevronDownIcon class={cn('size-3.5 transition-transform', open && 'rotate-180')} />
						</Button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<ul class="border-border text-muted-foreground mt-1 flex flex-col gap-1 border-l-2 pl-3">
						{#each parts as part, index (index)}
							<li class="flex items-center gap-2 text-xs">
								{#if failed(part)}
									<TriangleAlertIcon class="size-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
								{:else}
									<CheckIcon class="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
								{/if}
								<span class="truncate">{toolLabel(getToolName(part), true)}</span>
							</li>
						{/each}
					</ul>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
{/if}
