<script lang="ts">
	import { getToolName } from 'ai';
	import { z } from 'zod';
	import CheckIcon from '@lucide/svelte/icons/check';
	import WrenchIcon from '@lucide/svelte/icons/wrench';
	import XIcon from '@lucide/svelte/icons/x';
	import type { HTMLAttributes } from 'svelte/elements';
	import { toolLabel } from '$lib/ai/labels';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import { StatusBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * One tool part of an assistant message, in whichever of the SDK's states
	 * it is in: the input streaming in, the tool running, an approval the user
	 * has to answer, or the result. Typed against the agent's tool set, so
	 * `part.input` and `part.output` are the tool's own types.
	 */
	type Part = AssistantToolUIPart;

	let {
		ref = $bindable(null),
		class: className,
		part,
		onApprove,
		onDeny,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children' | 'part'> & {
		part: Part;
		/** Called with the approval id when the user allows a paused tool call. */
		onApprove?: (approvalId: string) => void;
		onDeny?: (approvalId: string) => void;
	} = $props();

	const name = $derived(getToolName(part));
	const settled = $derived(
		part.state === 'output-available' ||
			part.state === 'output-error' ||
			part.state === 'output-denied'
	);
	const label = $derived(toolLabel(name, settled));

	const STATUS = {
		'input-streaming': { text: 'Preparing', tone: 'info' },
		'input-available': { text: 'Running', tone: 'info' },
		'approval-requested': { text: 'Needs approval', tone: 'warning' },
		'approval-responded': { text: 'Answered', tone: 'neutral' },
		'output-available': { text: 'Done', tone: 'success' },
		'output-error': { text: 'Failed', tone: 'error' },
		'output-denied': { text: 'Denied', tone: 'neutral' }
	} satisfies Record<Part['state'], { text: string; tone: BadgeTone }>;
	const status = $derived(STATUS[part.state]);
	const running = $derived(part.state === 'input-streaming' || part.state === 'input-available');

	type ToolOutput = Extract<Part, { state: 'output-available' }>['output'];

	/** A field worth showing in a one-line summary of what was asked. */
	const primitive = z.union([z.string(), z.number(), z.boolean()]);

	/** The primitive fields of a tool's input (partial while it streams in). */
	function primitiveEntries(input: Part['input']): [string, string][] {
		return Object.entries(input ?? {}).flatMap(([key, item]) => {
			const parsed = primitive.safeParse(item);
			if (!parsed.success) return [];
			const entry: [string, string] = [key, String(parsed.data)];
			return [entry];
		});
	}

	/** What came back, in a phrase: the first list's length, or a miss, or nothing. */
	function summarizeOutput(output: ToolOutput): string | null {
		for (const [key, item] of Object.entries(output)) {
			if (Array.isArray(item)) return `${item.length} ${key}`;
		}
		if ('found' in output && output.found === false) return 'Not found';
		return null;
	}

	const inputSummary = $derived(primitiveEntries(part.input));
	const outputSummary = $derived(
		part.state === 'output-available' ? summarizeOutput(part.output) : null
	);
</script>

<div
	bind:this={ref}
	data-slot="assistant-tool-call"
	class={cn('border-border bg-card rounded-lg border px-3 py-2 text-sm', className)}
	{...restProps}
>
	<div class="flex flex-wrap items-center gap-2">
		{#if running}
			<Spinner class="text-muted-foreground" />
		{:else}
			<WrenchIcon class="text-muted-foreground size-4" />
		{/if}
		<span class="font-medium">{label}</span>
		<StatusBadge tone={status.tone} class="ml-auto">{status.text}</StatusBadge>
	</div>

	{#if inputSummary.length > 0}
		<dl class="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
			{#each inputSummary as [key, value] (key)}
				<div class="flex gap-1">
					<dt class="font-medium">{key}:</dt>
					<dd class="truncate">{value}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if part.state === 'approval-requested' && !part.approval.isAutomatic}
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<p class="text-muted-foreground mr-auto text-xs">
				{part.approval.requestReason ?? 'This changes your data. Allow it?'}
			</p>
			<Button size="sm" variant="outline" onclick={() => onDeny?.(part.approval.id)}>
				<XIcon />
				Deny
			</Button>
			<Button size="sm" onclick={() => onApprove?.(part.approval.id)}>
				<CheckIcon />
				Approve
			</Button>
		</div>
	{:else if part.state === 'approval-responded'}
		<p class="text-muted-foreground mt-1.5 text-xs">
			{part.approval.approved ? 'You approved this.' : 'You denied this.'}
		</p>
	{:else if part.state === 'output-error'}
		<p class="text-destructive mt-1.5 text-xs">{part.errorText}</p>
	{:else if outputSummary}
		<p class="text-muted-foreground mt-1.5 text-xs">{outputSummary}</p>
	{/if}
</div>
