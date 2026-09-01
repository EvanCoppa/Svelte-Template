<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The vote tally appearing after the bars have finished filling. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	import PollRow from './poll-row.svelte';

	export type PollOption = {
		id: string;
		label: string;
		votes: number;
	};

	export interface PollResultsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The choices, each { id, label, votes }. Votes are the truth the reveal draws; update them optimistically in onVote. */
		options: PollOption[];
		/** The question. Required — a poll with no name is unreadable, to everyone. */
		label: string;
		/** The current choice. Bindable; `null` means not voted, anything else reveals the results. */
		value?: string | null;
		/** Starting choice when not bound, for a poll the person already answered. */
		defaultValue?: string | null;
		/** Fires once, on the first choice. Later clicks are refused — one person, one vote. */
		onVote?: (id: string) => void;
	}

	let {
		class: className,
		options,
		label,
		defaultValue = null,
		value = $bindable(defaultValue),
		onVote,
		...restProps
	}: PollResultsProps = $props();

	const chosen = $derived(value ?? null);
	const revealed = $derived(chosen !== null);

	const total = $derived(options.reduce((sum, o) => sum + Math.max(0, o.votes), 0));
	const top = $derived(options.reduce((best, o) => (o.votes > best ? o.votes : best), 0));

	const pollRows = $derived(
		options.map((option) => ({
			...option,
			share: total > 0 ? Math.max(0, option.votes) / total : 0,
			winner: total > 0 && option.votes === top,
			mine: option.id === chosen
		}))
	);

	function vote(id: string) {
		if (chosen !== null) return;
		value = id;
		onVote?.(id);
	}

	let spoken = $state('');

	$effect(() => {
		if (!revealed) return;
		const winner = pollRows.find((r) => r.winner);
		const count = total;
		const t = setTimeout(() => {
			spoken = winner
				? `Results: ${winner.label} leads with ${Math.round(winner.share * 100)} percent of ${count} votes`
				: `Results shown, ${count} votes`;
		}, 700);
		return () => clearTimeout(t);
	});
</script>

<div {...restProps} role="group" aria-label={label} class={cn('w-full', className)}>
	<p class="text-foreground mb-2.5 text-[13px] font-medium">{label}</p>
	<div class="space-y-1.5">
		{#each pollRows as row (row.id)}
			<PollRow
				label={row.label}
				share={row.share}
				winner={row.winner}
				mine={row.mine}
				{revealed}
				reduced={reducedMotion.current}
				onPick={() => vote(row.id)}
			/>
		{/each}
	</div>
	<p class="text-muted-foreground/70 mt-2 h-4 font-mono text-[10.5px] tabular-nums">
		<span
			class="inline-block"
			{@attach motionTo(() => ({
				keyframes: { opacity: revealed ? 1 : 0 },
				// Held back so the count lands after the bars have finished filling.
				transition: { ...CROSSFADE, delay: revealed ? 0.4 : 0 }
			}))}
		>
			{total.toLocaleString('en-US')} votes
		</span>
	</p>
	<span role="status" class="sr-only">{spoken}</span>
</div>
