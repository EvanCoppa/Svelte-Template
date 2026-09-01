<script lang="ts">
	import { animate } from 'motion';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition } from '$lib/motion.js';

	/** The winner's tick landing. Under-damped, so it overshoots into place. */
	const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;
	/** The percentage readout appearing once the vote is in. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	interface PollRowProps {
		label: string;
		share: number;
		winner: boolean;
		mine: boolean;
		revealed: boolean;
		reduced: boolean;
		onPick: () => void;
	}

	let { label, share, winner, mine, revealed, reduced, onPick }: PollRowProps = $props();

	let landed = $state(false);

	let fillEl: HTMLSpanElement | undefined = $state();
	// Captured through an attachment rather than `bind:this`: the readout's text is
	// written imperatively below, and an attachment's node is the one place Svelte
	// expects a caller to own the element directly.
	let readoutNode: HTMLSpanElement | undefined;

	function bindReadout(node: HTMLSpanElement) {
		readoutNode = node;
		return () => {
			readoutNode = undefined;
		};
	}

	// The fill's current progress, persisted so a votes update mid-flight
	// resumes the spring from where the bar currently is, not from zero.
	let progress = 0;

	function apply(p: number) {
		progress = p;
		if (fillEl) {
			fillEl.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0 round 5px)`;
		}
		if (readoutNode) {
			const next = `${Math.round(p * 100)}%`;
			if (readoutNode.textContent !== next) readoutNode.textContent = next;
		}
	}

	$effect(() => {
		if (!revealed) return;
		const target = share;

		if (reduced) {
			apply(target);
			landed = true;
			return;
		}

		let cancelled = false;
		const controls = animate(progress, target, {
			type: 'spring',
			stiffness: 210,
			damping: 34,
			mass: 0.9,
			onUpdate: (p: number) => apply(p)
		});
		controls.finished.then(() => {
			if (!cancelled) landed = true;
		});
		return () => {
			cancelled = true;
			controls.stop();
		};
	});

	function tickIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], scale: [0.4, 1] },
			transition: POP,
			reduced: { keyframes: { opacity: [0, 1] }, transition: { duration: 0.12 } }
		});
	}
</script>

<button
	type="button"
	onclick={onPick}
	aria-disabled={revealed}
	aria-pressed={revealed ? mine : undefined}
	class={cn(
		'group relative h-9 w-full overflow-hidden rounded-[8px] border text-left transition-[border-color,background-color,box-shadow,transform] duration-200 outline-none',
		'focus-visible:after:bg-primary/5 focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:rounded-[7px] focus-visible:after:shadow-[inset_0_0_0_1px_var(--color-ring)]',
		revealed
			? 'border-border bg-muted/70 cursor-default shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'
			: 'border-border bg-card hover:bg-muted/40 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.08)] active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]'
	)}
>
	<span
		bind:this={fillEl}
		aria-hidden="true"
		style="clip-path: inset(0 100% 0 0 round 5px)"
		class={cn(
			'absolute inset-[3px] rounded-[5px]',
			mine
				? 'bg-primary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.3)]'
				: 'bg-foreground/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.3)]'
		)}
	></span>
	<span class="relative flex h-full items-center gap-2 px-3">
		<span
			class={cn(
				'min-w-0 flex-1 truncate text-[13px] transition-[color,font-weight] duration-200',
				revealed && winner
					? 'text-foreground font-medium'
					: 'text-muted-foreground group-hover:text-foreground'
			)}
		>
			{label}
		</span>
		<span class="grid size-4 shrink-0 place-items-center">
			{#if revealed && winner && landed}
				<span in:tickIn class="text-foreground">
					<svg viewBox="0 0 256 256" width="11" height="11" fill="none" aria-hidden="true">
						<polyline
							points="216 72 104 184 48 128"
							stroke="currentColor"
							stroke-width="26"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
			{/if}
		</span>
		<span class="relative grid shrink-0 text-right">
			<span
				aria-hidden="true"
				class="invisible col-start-1 row-start-1 font-mono text-[11px] tabular-nums"
			>
				100%
			</span>
			<span
				{@attach bindReadout}
				aria-hidden="true"
				class="text-muted-foreground col-start-1 row-start-1 font-mono text-[11px] tabular-nums"
				{@attach motionTo(() => ({
					keyframes: { opacity: revealed ? 1 : 0 },
					transition: CROSSFADE
				}))}
			>
				0%
			</span>
		</span>
	</span>
</button>
