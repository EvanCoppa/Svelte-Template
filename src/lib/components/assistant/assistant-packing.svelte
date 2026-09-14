<script lang="ts">
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import PackageIcon from '@lucide/svelte/icons/package';
	import { SvelteMap } from 'svelte/reactivity';
	import { page } from '$app/state';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import { StatusBadge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { recordHref } from '$lib/crm/records';
	import { LINE_FULFILLMENT_TONE } from '$lib/crm/tones';
	import Artifact from './assistant-artifact.svelte';

	/**
	 * What is left to ship on an order, as a card the reader packs from: a
	 * line is ticked into the box or it is not, and a ticked line ships its
	 * whole quantity or the number typed beside it — less than the line has
	 * is a split, the order page's own rule for a partial shipment. The page
	 * owns the write (`pack`, a hidden form posting the page's action), so
	 * this hands back the lines and their quantities and nothing else, and
	 * once the box exists it says so and points at it.
	 */
	type Output = Extract<
		AssistantToolUIPart,
		{ type: 'tool-packableLines'; state: 'output-available' }
	>['output'];

	let {
		output,
		shipmentId = null,
		pending = false,
		onPack
	}: {
		output: Output;
		/** The box this card opened, once it has; null until then. */
		shipmentId?: string | null;
		/** True while the box is being opened. */
		pending?: boolean;
		onPack?: (orderId: string, lines: { id: string; quantity: string }[]) => void;
	} = $props();

	/** The lines ticked, each with the quantity typed for it (blank means the whole line). */
	const picked = new SvelteMap<string, string>();

	function toggle(id: string, checked: boolean) {
		if (checked) picked.set(id, '');
		else picked.delete(id);
	}

	const order = $derived(output.order);
	const ticked = $derived(output.lines.filter((line) => picked.has(line.id)));
	const canOpen = $derived(Boolean(page.data.terms?.shipments));
	const done = $derived(shipmentId !== null);

	// Checkbox ids must be unique per card on a thread that draws two.
	const prefix = $props.id();

	function pack() {
		if (!order) return;
		onPack?.(
			order.id,
			ticked.map((line) => ({
				id: line.id,
				quantity: picked.get(line.id) || String(line.quantity)
			}))
		);
	}
</script>

{#if order}
	<Artifact
		icon={PackageIcon}
		title="Ship {order.number}"
		meta={order.customer ?? undefined}
		class="max-w-xl"
	>
		{#snippet actions()}
			{#if canOpen && page.data.terms?.orders}
				<Button variant="ghost" size="xs" href={recordHref('order', order.id)}>
					Open order
					<ArrowUpRightIcon />
				</Button>
			{/if}
		{/snippet}

		{#if done && shipmentId}
			<p class="text-sm">
				Box opened with {ticked.length}
				{ticked.length === 1 ? 'line' : 'lines'}.
				{#if canOpen}
					<a
						href={recordHref('shipment', shipmentId)}
						class="font-medium underline-offset-4 hover:underline">Pack it →</a
					>
				{/if}
			</p>
		{:else if output.lines.length === 0}
			<p class="text-muted-foreground text-sm">
				Every line is already in a box{output.packed > 0 ? ` (${output.packed} packed)` : ''}.
			</p>
		{:else}
			<ul class="divide-border -mx-3 divide-y">
				{#each output.lines as line (line.id)}
					{@const id = `${prefix}-${line.id}`}
					{@const checked = picked.has(line.id)}
					<li class="flex items-center gap-3 px-3 py-2">
						<Checkbox
							{id}
							{checked}
							disabled={!output.canPack || pending}
							onCheckedChange={(value) => toggle(line.id, value === true)}
						/>
						<Label for={id} class="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5">
							<span class="truncate text-sm font-normal">{line.description}</span>
							<span class="text-muted-foreground text-xs">
								{#if line.sku}{line.sku} ·
								{/if}{line.quantity} ordered
							</span>
						</Label>
						<StatusBadge size="sm" tone={LINE_FULFILLMENT_TONE[line.status]}>
							{line.status}
						</StatusBadge>
						<Input
							type="number"
							inputmode="decimal"
							min="0"
							max={line.quantity}
							step="any"
							placeholder={String(line.quantity)}
							aria-label="Quantity of {line.description} to ship"
							disabled={!checked || pending}
							value={picked.get(line.id) ?? ''}
							oninput={(event) => picked.set(line.id, event.currentTarget.value)}
							class="h-7 w-20 text-xs"
						/>
					</li>
				{/each}
			</ul>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
				<p class="text-muted-foreground text-xs">
					{#if output.packed > 0}{output.packed} already packed ·
					{/if}
					{ticked.length} of {output.lines.length} ticked
				</p>
				{#if output.canPack}
					<Button size="sm" disabled={ticked.length === 0 || pending || !onPack} onclick={pack}>
						{pending ? 'Opening a box…' : 'Open a box'}
					</Button>
				{:else}
					<p class="text-muted-foreground text-xs">
						Your role can read this order but not ship it.
					</p>
				{/if}
			</div>
		{/if}
	</Artifact>
{/if}
