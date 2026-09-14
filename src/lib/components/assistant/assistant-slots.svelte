<script lang="ts">
	import CalendarCheckIcon from '@lucide/svelte/icons/calendar-check';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { SvelteMap } from 'svelte/reactivity';
	import type { AssistantToolUIPart } from '$lib/ai/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import Artifact from './assistant-artifact.svelte';

	/**
	 * Free time, offered: the slots `findOpenSlots` found, in piles by day,
	 * each a button that books it. The page owns the booking — a hidden form
	 * posting the page's `book` action, the calendar's drag-to-move road — so
	 * this only says which slot was picked, and draws the ones already taken
	 * this session as booked.
	 *
	 * Every time here is read in the zone the search ran in, not the
	 * browser's: the card says "9:00 AM Tuesday" in the zone the assistant
	 * was told, which is the one the reader asked in.
	 */
	type Output = Extract<
		AssistantToolUIPart,
		{ type: 'tool-findOpenSlots'; state: 'output-available' }
	>['output'];

	type Slot = Output['slots'][number];

	let {
		output,
		title,
		booked,
		onBook
	}: {
		output: Output;
		/** What the booking is for — the tool's own input. */
		title: string;
		/** The `startsAt` of every slot booked from this thread so far. */
		booked: ReadonlySet<string>;
		onBook?: (slot: Slot) => void;
	} = $props();

	const day = $derived(
		new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: output.timeZone
		})
	);
	const clock = $derived(
		new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: output.timeZone })
	);

	/** The slots in piles by the day they fall on, in the order found. */
	const days = $derived.by(() => {
		const piles = new SvelteMap<string, Slot[]>();
		for (const slot of output.slots) {
			const key = day.format(new Date(slot.startsAt));
			piles.set(key, [...(piles.get(key) ?? []), slot]);
		}
		return [...piles].map(([label, slots]) => ({ label, slots }));
	});

	const meta = $derived(
		`${output.durationMinutes} min · ${output.slots.length} ${output.slots.length === 1 ? 'slot' : 'slots'}`
	);
</script>

<Artifact icon={CalendarCheckIcon} {title} {meta} class="max-w-xl">
	{#if days.length === 0}
		<p class="text-muted-foreground text-sm">Nothing free in that window.</p>
	{:else}
		<div class="space-y-3">
			{#each days as pile (pile.label)}
				<div class="space-y-1.5">
					<p class="text-muted-foreground text-xs font-medium">{pile.label}</p>
					<ul class="flex flex-wrap gap-1.5">
						{#each pile.slots as slot (slot.startsAt)}
							{@const taken = booked.has(slot.startsAt)}
							<li>
								<Button
									variant={taken ? 'secondary' : 'outline'}
									size="xs"
									disabled={taken || !output.canBook || !onBook}
									onclick={() => onBook?.(slot)}
									aria-label={taken
										? `Booked ${clock.format(new Date(slot.startsAt))} ${pile.label}`
										: `Book ${clock.format(new Date(slot.startsAt))} ${pile.label}`}
								>
									{#if taken}<CheckIcon />{/if}
									{clock.format(new Date(slot.startsAt))}
								</Button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
		{#if !output.canBook}
			<p class="text-muted-foreground mt-3 text-xs">
				Your role can read the calendar but not book on it.
			</p>
		{/if}
	{/if}
</Artifact>
