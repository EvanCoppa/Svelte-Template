<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionPress, motionTo } from '$lib/motion.js';

	/** The button's own dip under a press. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** Labels trading places as the request runs. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

	export interface LoadingButtonProps extends Omit<
		HTMLButtonAttributes,
		'children' | 'disabled' | 'onclick'
	> {
		/** Runs on click. Sync throws and rejected promises settle into the error state. */
		onAction: () => void;
		/** The idle label. A string because it also becomes the button's accessible name. */
		label: string;
		pendingLabel?: string;
		successLabel?: string;
		errorLabel?: string;
		/** Milliseconds the settled state is held before reverting to idle. */
		resetAfter?: number;
		disabled?: boolean;
		onError?: (cause: unknown) => void;
	}

	let {
		class: className,
		onAction,
		label,
		pendingLabel,
		successLabel = 'Done',
		errorLabel = 'Try again',
		resetAfter = 1400,
		disabled = false,
		onError,
		...restProps
	}: LoadingButtonProps = $props();

	let status = $state<AsyncActionStatus>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let runSeq = 0;

	onDestroy(() => {
		runSeq += 1;
		if (timer) clearTimeout(timer);
	});

	function clearTimer() {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function settle(id: number, next: 'success' | 'error') {
		if (id !== runSeq) return;
		clearTimer();
		status = next;
		timer = setTimeout(() => {
			if (id === runSeq) status = 'idle';
		}, resetAfter);
	}

	function run() {
		if (status === 'pending') return;
		clearTimer();
		const id = ++runSeq;
		status = 'pending';

		Promise.resolve()
			.then(() => onAction())
			.then(
				() => settle(id, 'success'),
				(cause: unknown) => {
					onError?.(cause);
					settle(id, 'error');
				}
			);
	}

	const pending = $derived(status === 'pending');
	const resolvedPending = $derived(pendingLabel ?? label);
	const currentLabel = $derived(
		status === 'pending'
			? resolvedPending
			: status === 'success'
				? successLabel
				: status === 'error'
					? errorLabel
					: label
	);
</script>

<button
	{...restProps}
	type="button"
	{disabled}
	aria-label={currentLabel}
	aria-busy={pending || undefined}
	aria-disabled={pending || undefined}
	data-slot="loading-button"
	data-status={status}
	onclick={(event) => {
		if (pending) {
			event.preventDefault();
			return;
		}
		run();
	}}
	{@attach disabled || pending ? undefined : motionPress({ y: 1 }, { y: 0 }, CELL)}
	class={cn(
		'border-border bg-card text-foreground hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/40 relative inline-flex h-9 touch-manipulation items-center justify-center rounded-[9px] border px-3.5 text-[13px] font-medium shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] transition-[border-color,box-shadow,background-color] duration-150 outline-none select-none focus-visible:ring-2 disabled:opacity-50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]',
		className
	)}
>
	<span aria-hidden="true" class="relative grid place-items-center">
		<span
			class="text-foreground col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap"
			{@attach motionTo(() => ({
				keyframes:
					status === 'idle'
						? { opacity: 1, y: 0, filter: 'blur(0px)' }
						: { opacity: 0, y: 3, filter: 'blur(3px)' },
				transition: CROSSFADE
			}))}
		>
			{label}
		</span>

		<span
			class="text-muted-foreground col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap"
			{@attach motionTo(() => ({
				keyframes:
					status === 'pending'
						? { opacity: 1, y: 0, filter: 'blur(0px)' }
						: { opacity: 0, y: 3, filter: 'blur(3px)' },
				transition: CROSSFADE
			}))}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				aria-hidden="true"
				class="shrink-0"
				{@attach motionTo(
					() => ({
						keyframes: pending ? { rotate: 360 } : { rotate: 0 },
						transition: pending
							? { duration: 0.85, repeat: Infinity, ease: 'linear' }
							: { duration: 0 }
					}),
					{ initial: true }
				)}
			>
				<circle
					cx="6"
					cy="6"
					r="4.5"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-opacity="0.22"
				/>
				<path
					d="M10.5 6A4.5 4.5 0 0 0 6 1.5"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
			{resolvedPending}
		</span>

		<span
			class="col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400"
			{@attach motionTo(() => ({
				keyframes:
					status === 'success'
						? { opacity: 1, y: 0, filter: 'blur(0px)' }
						: { opacity: 0, y: 3, filter: 'blur(3px)' },
				transition: CROSSFADE
			}))}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				aria-hidden="true"
				class="shrink-0"
			>
				<path
					d="M2.6 6.3 4.9 8.6 9.4 3.6"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			{successLabel}
		</span>

		<span
			class="text-destructive col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap"
			{@attach motionTo(() => ({
				keyframes:
					status === 'error'
						? { opacity: 1, y: 0, filter: 'blur(0px)' }
						: { opacity: 0, y: 3, filter: 'blur(3px)' },
				transition: CROSSFADE
			}))}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				aria-hidden="true"
				class="shrink-0"
			>
				<path d="M6 2.9v3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
				<path d="M6 9.05h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
			</svg>
			{errorLabel}
		</span>
	</span>
</button>

<span role="status" aria-live="polite" class="sr-only">
	{status === 'success' ? successLabel : status === 'error' ? errorLabel : ''}
</span>
