<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionPress, motionTo } from '$lib/motion.js';

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** The button's own dip under a press. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
	/** Icons and labels trading places. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	/** The tick drawing itself along its own path. */
	const DRAW = { duration: 0.26, ease: EASE } as const;

	export type CopyStatus = 'idle' | 'copied' | 'error';

	export interface CopyButtonProps extends Omit<
		HTMLButtonAttributes,
		'children' | 'disabled' | 'onclick' | 'value'
	> {
		/** The text written to the clipboard. An empty string is a no-op. */
		value: string;
		label?: string;
		copiedLabel?: string;
		errorLabel?: string;
		/** Milliseconds the tick is held before reverting. Each copy restarts the clock. */
		timeout?: number;
		onCopy?: (value: string) => void;
		onError?: (cause: unknown) => void;
		disabled?: boolean;
	}

	let {
		class: className,
		value,
		label = 'Copy',
		copiedLabel = 'Copied',
		errorLabel = 'Failed',
		timeout = 2000,
		onCopy,
		onError,
		disabled = false,
		...restProps
	}: CopyButtonProps = $props();

	let status = $state<CopyStatus>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (resetTimer) clearTimeout(resetTimer);
	});

	function writeFallback(text: string): boolean {
		const area = document.createElement('textarea');
		area.value = text;
		area.setAttribute('readonly', '');
		area.style.position = 'fixed';
		area.style.top = '0';
		area.style.left = '0';
		area.style.opacity = '0';
		document.body.appendChild(area);

		const selection = document.getSelection();
		const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

		area.select();
		let ok = false;
		try {
			ok = document.execCommand('copy');
		} catch {
			// execCommand throws in a sandboxed document; `ok` stays false.
		}

		document.body.removeChild(area);
		if (selection && previous) {
			selection.removeAllRanges();
			selection.addRange(previous);
		}
		return ok;
	}

	async function copy() {
		if (!value) return;

		let ok = false;
		let reason: unknown;

		try {
			if ('navigator' in globalThis && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
				ok = true;
			} else {
				ok = writeFallback(value);
			}
		} catch (error) {
			reason = error;
			try {
				ok = writeFallback(value);
			} catch {
				// Both paths refused. `ok` stays false and the error state shows.
			}
		}

		status = ok ? 'copied' : 'error';
		if (ok) onCopy?.(value);
		else onError?.(reason);

		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(() => {
			status = 'idle';
		}, timeout);
	}

	const labels = $derived<Array<[CopyStatus, string]>>([
		['idle', label],
		['copied', copiedLabel],
		['error', errorLabel]
	]);
</script>

<button
	{...restProps}
	type="button"
	{disabled}
	aria-label={label}
	data-slot="copy-button"
	data-status={status}
	onclick={() => {
		void copy();
	}}
	{@attach disabled ? undefined : motionPress({ y: 1 }, { y: 0 }, CELL)}
	class={cn(
		'border-border bg-card text-foreground hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/40 inline-flex h-9 touch-manipulation items-center gap-2 rounded-[9px] border px-3 text-[13px] font-medium shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(28,25,23,0.06),0_1px_2px_rgba(28,25,23,0.08)] transition-[border-color,box-shadow,background-color] duration-150 outline-none select-none focus-visible:ring-2 disabled:opacity-50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]',
		className
	)}
>
	<span class="grid size-[14px] shrink-0" aria-hidden="true">
		<svg
			viewBox="0 0 14 14"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="col-start-1 row-start-1 size-[14px]"
			{@attach motionTo(() => ({
				keyframes: { opacity: status === 'idle' ? 1 : 0, scale: status === 'idle' ? 1 : 0.92 },
				transition: CROSSFADE
			}))}
		>
			<path
				d="M9.6 5.1V3.7A1.7 1.7 0 0 0 7.9 2H3.7A1.7 1.7 0 0 0 2 3.7v4.2a1.7 1.7 0 0 0 1.7 1.7h1.4"
			/>
			<rect x="5.1" y="5.1" width="6.9" height="6.9" rx="1.7" />
		</svg>

		<svg
			viewBox="0 0 14 14"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="col-start-1 row-start-1 size-[14px]"
			{@attach motionTo(() => ({
				keyframes: { opacity: status === 'copied' ? 1 : 0, scale: status === 'copied' ? 1 : 0.92 },
				transition: CROSSFADE
			}))}
		>
			<path
				d="M2.9 7.4 5.6 10.1 11.1 4"
				{@attach motionTo(() => ({
					keyframes: { pathLength: status === 'copied' ? 1 : 0 },
					transition: DRAW
				}))}
			/>
		</svg>

		<svg
			viewBox="0 0 14 14"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="col-start-1 row-start-1 size-[14px]"
			{@attach motionTo(() => ({
				keyframes: { opacity: status === 'error' ? 1 : 0, scale: status === 'error' ? 1 : 0.92 },
				transition: CROSSFADE
			}))}
		>
			<path d="M3.6 3.6 10.4 10.4" />
			<path d="M10.4 3.6 3.6 10.4" />
		</svg>
	</span>

	<span aria-hidden="true" class="relative grid">
		{#each labels as [key, text] (key)}
			<span
				class="col-start-1 row-start-1 whitespace-nowrap"
				{@attach motionTo(() => ({
					keyframes:
						key === status
							? { opacity: 1, y: 0, filter: 'blur(0px)' }
							: { opacity: 0, y: 3, filter: 'blur(3px)' },
					transition: CROSSFADE
				}))}
			>
				{text}
			</span>
		{/each}
	</span>

	<span role="status" aria-live="polite" class="sr-only">
		{status === 'copied' ? copiedLabel : status === 'error' ? errorLabel : ''}
	</span>
</button>
