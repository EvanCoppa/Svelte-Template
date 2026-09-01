<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { SvelteSet } from 'svelte/reactivity';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition, reducedMotion } from '$lib/motion.js';

	/** The pod arriving, and morphing between its compact and expanded box. */
	const SURFACE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;
	/** The two faces trading places inside it. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	/** The phase glyphs swapping. */
	const SMALL = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	/** The progress bar filling. */
	const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const LEAVE: [number, number, number, number] = [0.4, 0, 1, 1];
	const SPIN = { duration: 0.85, ease: 'linear', repeat: Infinity } as const;
	const DRAW = { duration: 0.3, ease: EASE } as const;
	const STILL = { duration: 0 } as const;

	export type ActivityPhase = 'running' | 'success' | 'error';

	export type ActivityAction = {
		label: string;
		onSelect: () => void;
	};

	export type Activity = {
		/** Identity of this run. A new id is a new activity, not an update. */
		id: string;
		title: string;
		detail?: string;
		/** 0–1, or null/undefined for an indeterminate wait. */
		progress?: number | null;
		phase: ActivityPhase;
		/** Offered on failure — a Retry that stays live while the pod does. */
		action?: ActivityAction;
	};

	export interface LiveActivityProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The one thing the system is doing. `null` means the pod is gone, not hidden. */
		activity: Activity | null;
		/** Wired to the close affordance and to Escape once the work has resolved. */
		onDismiss?: () => void;
		/** Expanded width in pixels. The pod stays a small object over the page. */
		width?: number;
		/** Accessible name of the close button. */
		dismissLabel?: string;
		/** Accessible name of the region. */
		label?: string;
	}

	/** The pod peeks on every phase change and holds this long before folding back. */
	const PEEK_FOR = 2600;
	/** Grace period after the pointer leaves, so a glancing exit does not fold it. */
	const LEAVE_DELAY = 160;

	let {
		class: className,
		activity,
		onDismiss,
		width = 300,
		dismissLabel = 'Dismiss activity',
		label = 'Activity',
		...restProps
	}: LiveActivityProps = $props();

	let hovered = $state(false);
	let focused = $state(false);
	let peeking = $state(false);
	let spoken = $state('');
	let measured = $state(false);
	let morphing = $state(false);

	let compactSize = $state({ w: 0, h: 0 });
	let expandedSize = $state({ w: 0, h: 0 });

	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	const said = new SvelteSet<string>();

	const phase = $derived<ActivityPhase>(activity?.phase ?? 'running');
	const expanded = $derived(
		activity !== null && (hovered || focused || peeking || phase === 'error')
	);
	const dims = $derived(expanded ? expandedSize : compactSize);

	const percent = $derived(
		activity == null || activity.progress == null
			? null
			: Math.round(Math.min(1, Math.max(0, activity.progress)) * 100)
	);

	onDestroy(() => {
		if (leaveTimer) clearTimeout(leaveTimer);
	});

	// The first measured size lands without a transition, so the pod arrives at its
	// real size instead of stretching out of nothing.
	$effect(() => {
		if (!measured) {
			morphing = false;
			return;
		}
		const frame = requestAnimationFrame(() => {
			morphing = true;
		});
		return () => cancelAnimationFrame(frame);
	});

	/** Arrival and departure of the whole surface: lift, scale and a short blur. */
	function podIn(node: Element) {
		return motionTransition(node, {
			keyframes: {
				opacity: [0, 1],
				y: [-10, 0],
				scale: [0.9, 1],
				filter: ['blur(6px)', 'blur(0px)']
			},
			transition: { ...SURFACE, opacity: { duration: 0.2, ease: EASE } },
			reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
		});
	}

	function podOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, y: -8, scale: 0.97, filter: 'blur(3px)' },
			transition: { duration: 0.16, ease: LEAVE },
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}

	// Peek on every phase change and on every update, then fold back to a glyph.
	$effect(() => {
		const current = activity;
		if (!current) {
			peeking = false;
			hovered = false;
			focused = false;
			measured = false;
			return;
		}
		peeking = true;
		const timer = setTimeout(() => {
			peeking = false;
		}, PEEK_FOR);
		return () => clearTimeout(timer);
	});

	// One announcement per phase per activity — started, finished, failed. Never a
	// progress stream.
	$effect(() => {
		const current = activity;
		if (!current) return;
		const key = `${current.id}:${current.phase}`;
		if (said.has(key)) return;
		if (said.size > 64) said.clear();
		said.add(key);
		spoken =
			current.phase === 'running'
				? `${current.title} started.`
				: current.phase === 'success'
					? `${current.title} finished.`
					: `${current.title} failed.`;
	});

	/** Both faces stay mounted and measured, so the pod morphs instead of re-laying out. */
	function watch(face: 'compact' | 'expanded'): Attachment<HTMLElement> {
		return (el) => {
			const read = () => {
				const next = { w: el.offsetWidth, h: el.offsetHeight };
				const prev = face === 'compact' ? compactSize : expandedSize;
				if (Math.abs(prev.w - next.w) < 0.5 && Math.abs(prev.h - next.h) < 0.5) return;
				if (face === 'compact') compactSize = next;
				else expandedSize = next;
				measured = true;
			};
			read();
			const observer = new ResizeObserver(read);
			observer.observe(el);
			return () => observer.disconnect();
		};
	}

	function enter() {
		if (leaveTimer) clearTimeout(leaveTimer);
		leaveTimer = undefined;
		hovered = true;
	}

	function leave() {
		if (leaveTimer) clearTimeout(leaveTimer);
		leaveTimer = setTimeout(() => {
			leaveTimer = undefined;
			hovered = false;
		}, LEAVE_DELAY);
	}

	function onFocusOut(event: FocusEvent) {
		// SAFETY: relatedTarget on a focus event is the element receiving focus, always a Node
		// (or null when focus leaves the document entirely).
		const next = event.relatedTarget as Node | null;
		// SAFETY: onFocusOut is only ever bound as this pod's own onfocusout handler, so
		// currentTarget is the pod's HTMLElement.
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) focused = false;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		if (phase === 'running') hovered = false;
		else onDismiss?.();
	}
</script>

{#snippet glyph()}
	<span class="relative grid size-[18px] shrink-0 place-items-center">
		<span
			class="text-primary col-start-1 row-start-1 flex"
			{@attach motionTo(() => ({
				keyframes: {
					opacity: phase === 'running' ? 1 : 0,
					scale: reducedMotion.current ? 1 : phase === 'running' ? 1 : 0.7
				},
				transition: SMALL
			}))}
		>
			<svg
				width="13"
				height="13"
				viewBox="0 0 12 12"
				fill="none"
				aria-hidden="true"
				class="origin-center"
				{@attach motionTo(
					() => ({
						keyframes: { rotate: reducedMotion.current ? 0 : 360 },
						transition: reducedMotion.current ? STILL : SPIN
					}),
					{ initial: true }
				)}
			>
				<circle cx="6" cy="6" r="4.4" stroke="currentColor" stroke-width="1.6" opacity="0.25" />
				<path
					d="M6 1.6a4.4 4.4 0 0 1 4.4 4.4"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
				/>
			</svg>
		</span>

		<span
			class="col-start-1 row-start-1 flex text-emerald-600 dark:text-emerald-400"
			{@attach motionTo(() => ({
				keyframes: {
					opacity: phase === 'success' ? 1 : 0,
					scale: reducedMotion.current ? 1 : phase === 'success' ? 1 : 0.7
				},
				transition: SMALL
			}))}
		>
			<svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<path
					d="M2.4 6.4 4.8 8.8 9.6 3.4"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
					{@attach motionTo(() => ({
						keyframes: { pathLength: phase === 'success' ? 1 : 0 },
						transition: DRAW
					}))}
				/>
			</svg>
		</span>

		<span
			class="text-destructive col-start-1 row-start-1 flex"
			{@attach motionTo(() => ({
				keyframes: {
					opacity: phase === 'error' ? 1 : 0,
					scale: reducedMotion.current ? 1 : phase === 'error' ? 1 : 0.7
				},
				transition: SMALL
			}))}
		>
			<svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<path d="M6 2.6v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				<rect x="5.2" y="8.2" width="1.6" height="1.6" rx="0.4" fill="currentColor" />
			</svg>
		</span>
	</span>
{/snippet}

<div
	{...restProps}
	role="region"
	aria-label={label}
	class={cn('pointer-events-none flex justify-center', className)}
>
	{#if activity}
		<!--
			Hover, focus and Escape only ever hold the pod open or let it go — every
			control inside it is a real button, so the surface itself stays a group.
		-->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="group"
			aria-label={activity.title}
			class={cn(
				'border-border bg-card pointer-events-auto relative overflow-hidden rounded-[11px] border',
				'shadow-[inset_0_1.5px_0_var(--color-background),0_1px_2px_rgb(0_0_0/0.07),0_16px_36px_-18px_rgb(0_0_0/0.5)]'
			)}
			style:transform-origin="50% 0%"
			in:podIn
			out:podOut
			{@attach motionTo(() => ({
				keyframes: { width: dims.w, height: dims.h },
				transition: morphing ? SURFACE : STILL
			}))}
			onpointerenter={enter}
			onpointerleave={leave}
			onfocusin={() => (focused = true)}
			onfocusout={onFocusOut}
			onkeydown={onKeyDown}
		>
			<div
				{@attach watch('compact')}
				aria-hidden={expanded}
				inert={expanded}
				class={cn(
					'absolute top-0 left-0 flex h-8 w-max items-center gap-1.5 px-2.5',
					expanded && 'pointer-events-none'
				)}
				{@attach motionTo(() => ({
					keyframes: { opacity: expanded ? 0 : 1 },
					transition: CROSSFADE
				}))}
			>
				{@render glyph()}
				{#if percent !== null && phase === 'running'}
					<span class="text-muted-foreground font-mono text-[10.5px] tabular-nums">{percent}%</span>
				{:else}
					<span class="text-foreground max-w-[120px] truncate text-[12px] font-medium">
						{activity.title}
					</span>
				{/if}
			</div>

			<div
				{@attach watch('expanded')}
				aria-hidden={!expanded}
				inert={!expanded}
				style:width={`${width}px`}
				class={cn('absolute top-0 left-0 px-3.5 py-3', !expanded && 'pointer-events-none')}
				{@attach motionTo(() => ({
					keyframes: { opacity: expanded ? 1 : 0 },
					transition: CROSSFADE
				}))}
			>
				<div class="flex items-center gap-2">
					{@render glyph()}
					<span class="text-foreground min-w-0 flex-1 truncate text-[13px] font-medium">
						{activity.title}
					</span>

					{#if activity.action}
						<button
							type="button"
							tabindex={expanded ? 0 : -1}
							onclick={activity.action.onSelect}
							class="border-border bg-card text-foreground hover:bg-muted inline-flex h-[24px] shrink-0 items-center rounded-[6px] border px-2 text-[11px] font-medium whitespace-nowrap shadow-xs transition-[background-color,box-shadow] duration-150 outline-none select-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] active:translate-y-px"
						>
							{activity.action.label}
						</button>
					{/if}

					{#if onDismiss && phase !== 'running'}
						<button
							type="button"
							tabindex={expanded ? 0 : -1}
							aria-label={dismissLabel}
							onclick={onDismiss}
							class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-primary/5 grid size-[22px] shrink-0 place-items-center rounded-[6px] transition-colors duration-150 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]"
						>
							<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
								<path
									d="M2.8 2.8l6.4 6.4M9.2 2.8l-6.4 6.4"
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					{/if}
				</div>

				{#if activity.detail}
					<p class="text-muted-foreground mt-1 truncate pl-[26px] text-[11.5px]">
						{activity.detail}
					</p>
				{/if}

				{#if percent !== null && phase !== 'error'}
					<div class="mt-2.5 flex items-center gap-2 pl-[26px]">
						<div
							class="bg-muted min-w-0 flex-1 rounded-[4px] p-[2px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.1)]"
						>
							<div class="relative h-[4px] overflow-hidden rounded-[2px]">
								<span
									aria-hidden="true"
									class="bg-primary absolute inset-0 block origin-left rounded-[2px]"
									{@attach motionTo(() => ({
										keyframes: { scaleX: percent / 100 },
										transition: FILL
									}))}
								></span>
							</div>
						</div>
						<span class="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">
							{percent}%
						</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<span role="status" aria-live="polite" class="sr-only">{spoken}</span>
</div>
