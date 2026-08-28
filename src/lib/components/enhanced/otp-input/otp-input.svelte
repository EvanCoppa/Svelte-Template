<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition, reducedMotion } from '$lib/motion.js';

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	/** A character landing in, or leaving, a cell. */
	const ENTER = { duration: 0.22, ease: EASE } as const;
	/** The status message under the row swapping for another. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	const STILL = { duration: 0 } as const;

	export type OtpMode = 'numeric' | 'alphanumeric';
	export type OtpStatus = 'idle' | 'error' | 'success';

	export interface OtpInputProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'class' | 'children' | 'autofocus'
	> {
		length?: number;
		mode?: OtpMode;
		value?: string;
		onValueChange?: (value: string) => void;
		onComplete?: (value: string) => void;
		status?: OtpStatus;
		errorMessage?: string;
		successMessage?: string;
		hint?: string;
		label?: string;
		groupEvery?: number;
		disabled?: boolean;
		autofocus?: boolean;
		focusOnError?: boolean;
		class?: string;
	}

	const ALLOW: Record<OtpMode, RegExp> = {
		numeric: /^[0-9]$/,
		alphanumeric: /^[0-9a-zA-Z]$/
	};

	let {
		class: className,
		length = 6,
		mode = 'numeric',
		value = $bindable(''),
		onValueChange,
		onComplete,
		status = 'idle',
		errorMessage = '',
		successMessage = '',
		hint = '',
		label = 'Verification code',
		groupEvery = 3,
		disabled = false,
		autofocus = false,
		focusOnError = true,
		...restProps
	}: OtpInputProps = $props();

	const uid = $props.id();
	const statusId = `${uid}-status`;

	function keep(text: string): string {
		return text
			.split('')
			.filter((c) => ALLOW[mode].test(c))
			.join('');
	}

	// The cell array is the source of truth, so clearing a digit in the middle
	// leaves a hole instead of sliding the digits after it one place left.
	let chars = $state<string[]>(
		(() => {
			const seed = value
				.split('')
				.filter((c) => ALLOW[mode].test(c))
				.slice(0, length);
			return Array.from({ length }, (_, i) => seed[i] ?? '');
		})()
	);
	let focusedIndex = $state(-1);
	let shaking = $state(false);

	let cells: (HTMLInputElement | null)[] = [];

	$effect(() => {
		if (chars.length !== length) {
			chars = Array.from({ length }, (_, i) => chars[i] ?? '');
			cells.length = length;
		}
	});

	function commit(next: string[]) {
		chars = next;
		const joined = next.join('');
		value = joined;
		onValueChange?.(joined);
		if (next.length > 0 && next.every((c) => c !== '')) onComplete?.(joined);
	}

	function focusAt(index: number) {
		const el = cells[Math.max(0, Math.min(length - 1, index))];
		if (!el) return;
		el.focus();
		el.select();
	}

	function fillFrom(index: number, text: string) {
		const incoming = keep(text);
		if (incoming.length === 0) return;
		const next = [...chars];
		let cursor = index;
		for (const c of incoming) {
			if (cursor >= length) break;
			next[cursor] = c;
			cursor += 1;
		}
		commit(next);
		focusAt(cursor);
	}

	export function clear() {
		commit(Array.from({ length }, () => ''));
		focusAt(0);
	}

	export function focus() {
		focusAt(0);
	}

	function handleInput(index: number, event: Event & { currentTarget: HTMLInputElement }) {
		const previous = chars[index] ?? '';
		const raw = event.currentTarget.value;
		const trimmed =
			raw.length > 1 && previous && raw.startsWith(previous) ? raw.slice(previous.length) : raw;
		const incoming = keep(trimmed);

		if (incoming.length === 0) {
			if (raw.length === 0 && previous) {
				const next = [...chars];
				next[index] = '';
				commit(next);
			}
			event.currentTarget.value = chars[index] ?? '';
			return;
		}

		if (incoming.length === 1) {
			const next = [...chars];
			next[index] = incoming;
			event.currentTarget.value = incoming;
			commit(next);
			if (index < length - 1) focusAt(index + 1);
			return;
		}

		// Autofilled codes arrive as one multi-character input event and are
		// distributed across the cells the same way a paste is.
		fillFrom(index, incoming);
	}

	function handleKeydown(
		index: number,
		event: KeyboardEvent & { currentTarget: HTMLInputElement }
	) {
		if (event.key === 'Backspace') {
			event.preventDefault();
			const next = [...chars];
			if (chars[index]) {
				next[index] = '';
				commit(next);
				return;
			}
			if (index > 0) {
				next[index - 1] = '';
				commit(next);
				focusAt(index - 1);
			}
			return;
		}
		if (event.key === 'Delete') {
			event.preventDefault();
			const next = [...chars];
			next[index] = '';
			commit(next);
			return;
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			focusAt(index - 1);
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			focusAt(index + 1);
			return;
		}
		if (event.key === 'Home') {
			event.preventDefault();
			focusAt(0);
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			focusAt(length - 1);
		}
	}

	// A pasted full-length code always fills from cell zero, so pasting into the
	// wrong cell is not a failure state.
	function handlePaste(index: number, event: ClipboardEvent) {
		event.preventDefault();
		const text = keep(event.clipboardData?.getData('text') ?? '');
		fillFrom(text.length >= length ? 0 : index, text);
	}

	function handleFocus(index: number, event: FocusEvent & { currentTarget: HTMLInputElement }) {
		event.currentTarget.select();
		const firstEmpty = chars.findIndex((c) => c === '');
		if (firstEmpty !== -1 && firstEmpty < index) {
			focusAt(firstEmpty);
			return;
		}
		focusedIndex = index;
	}

	function handleBlur(event: FocusEvent) {
		const to = event.relatedTarget;
		if (to instanceof HTMLInputElement && cells.includes(to)) return;
		focusedIndex = -1;
	}

	// The shake plays once on the false-to-true edge of the error status, and
	// rejection returns focus to the first cell with its content selected.
	let wasError = false;
	$effect(() => {
		const isError = status === 'error';
		if (isError && !wasError) {
			if (focusOnError && !disabled) focusAt(0);
			shaking = true;
		}
		wasError = isError;
	});

	$effect(() => {
		if (autofocus && !disabled) focusAt(0);
	});

	function charIn(node: Element) {
		return motionTransition(node, {
			keyframes: {
				opacity: [0, 1],
				scale: [0.97, 1],
				y: [10, 0],
				filter: ['blur(6px)', 'blur(0px)']
			},
			transition: ENTER,
			reduced: { keyframes: { opacity: 1 }, transition: STILL }
		});
	}

	function charOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.98, y: -6, filter: 'blur(3px)' },
			transition: ENTER,
			reduced: { keyframes: { opacity: 0 }, transition: { duration: 0.09 } }
		});
	}

	function messageIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], y: [3, 0] },
			transition: CROSSFADE,
			reduced: { keyframes: { opacity: [0, 1] }, transition: STILL }
		});
	}

	function messageOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, y: -3 },
			transition: CROSSFADE,
			reduced: { keyframes: { opacity: 0 }, transition: STILL }
		});
	}

	const error = $derived(status === 'error');
	const success = $derived(status === 'success');
	const hasStatus = $derived(
		hint.length > 0 || errorMessage.length > 0 || successMessage.length > 0
	);
	const message = $derived(error ? errorMessage : success ? successMessage : hint);
	const messageTone = $derived(
		error
			? 'text-destructive'
			: success
				? 'text-emerald-600 dark:text-emerald-400'
				: 'text-muted-foreground'
	);
</script>

<div data-slot="otp-input" class={cn('inline-flex flex-col', className)} {...restProps}>
	<div
		role="group"
		aria-label={label}
		class="relative flex gap-2"
		{@attach motionTo(() => ({
			keyframes: { x: shaking && !reducedMotion.current ? [0, -5, 4, -3, 0] : 0 },
			transition: { duration: 0.32, ease: EASE, onComplete: () => (shaking = false) }
		}))}
	>
		{#each chars as char, i (i)}
			{@const active = focusedIndex === i}
			{@const gap = groupEvery > 0 && i > 0 && i % groupEvery === 0}
			<div class={cn('relative h-12 w-10', gap && 'ml-3')}>
				<input
					bind:this={cells[i]}
					value={char}
					{disabled}
					type="text"
					inputmode={mode === 'numeric' ? 'numeric' : 'text'}
					autocomplete={i === 0 ? 'one-time-code' : 'off'}
					autocorrect="off"
					autocapitalize="off"
					spellcheck={false}
					aria-label={`${label}, character ${i + 1} of ${length}`}
					aria-invalid={error || undefined}
					aria-describedby={hasStatus ? statusId : undefined}
					oninput={(e) => handleInput(i, e)}
					onkeydown={(e) => handleKeydown(i, e)}
					onpaste={(e) => handlePaste(i, e)}
					onfocus={(e) => handleFocus(i, e)}
					onblur={handleBlur}
					class={cn(
						'h-12 w-10 rounded-[10px] border-2 text-center text-[15px] text-transparent caret-transparent transition-[background-color,border-color,box-shadow] duration-150 outline-none selection:bg-transparent focus-visible:outline-none disabled:opacity-50',
						error
							? 'border-destructive bg-card'
							: success
								? 'bg-card border-emerald-500 dark:border-emerald-400'
								: active
									? 'border-primary bg-card'
									: char
										? 'border-foreground/25 bg-card'
										: 'border-border bg-muted/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'
					)}
				/>

				<span
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 grid place-items-center"
				>
					{#key char}
						{#if char}
							<span
								in:charIn
								out:charOut
								class="text-foreground col-start-1 row-start-1 font-mono text-[15px] tabular-nums"
							>
								{char}
							</span>
						{/if}
					{/key}

					{#if active && !char && !disabled}
						<span
							class="bg-foreground col-start-1 row-start-1 block h-[17px] w-[1.5px] rounded-[1px]"
							{@attach motionTo(
								() => ({
									keyframes: { opacity: reducedMotion.current ? 1 : [1, 1, 0, 0] },
									transition: reducedMotion.current
										? STILL
										: {
												duration: 1.06,
												times: [0, 0.5, 0.5, 1],
												repeat: Infinity,
												ease: 'linear'
											}
								}),
								{ initial: true }
							)}
						></span>
					{/if}
				</span>
			</div>
		{/each}
	</div>

	{#if hasStatus}
		<div aria-hidden="true" class="mt-2 grid h-4 text-[11.5px] leading-4">
			{#key status}
				<span in:messageIn out:messageOut class={cn('col-start-1 row-start-1', messageTone)}>
					{message}
				</span>
			{/key}
		</div>
		<span id={statusId} role="status" class="sr-only">{message}</span>
	{/if}
</div>
