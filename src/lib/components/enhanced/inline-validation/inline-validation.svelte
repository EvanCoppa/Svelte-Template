<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** Glyphs and messages trading places as the field is judged. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

	export type ValidationStatus = 'idle' | 'pending' | 'valid' | 'invalid';

	export type Validator = (value: string) => string | null;

	export interface InlineValidationProps extends Omit<
		HTMLInputAttributes,
		'value' | 'class' | 'children'
	> {
		label: string;
		value?: string;
		validate: Validator;
		hint?: string;
		debounce?: number;
		reserveLines?: number;
		class?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		class: className,
		label,
		value = $bindable(''),
		validate,
		hint,
		id,
		type = 'text',
		placeholder,
		debounce = 400,
		reserveLines = 1,
		disabled = false,
		required = false,
		onValueChange,
		oninput,
		onblur,
		...restProps
	}: InlineValidationProps = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? `${uid}-field`);
	const hintId = `${uid}-hint`;
	const errorId = `${uid}-error`;

	let touched = $state(false);
	let status = $state<ValidationStatus>('idle');
	let error = $state<string | null>(null);
	// Last shown error text, kept so the message can fade out without going blank.
	let message = $state('');

	let timer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	function clearTimer() {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	// After the first blur, a value that becomes correct clears immediately while a
	// value that is still wrong waits out the debounce, so the message cannot
	// flicker once per keystroke.
	function evaluate(next: string) {
		if (!touched) return;
		clearTimer();

		const fault = validate(next);
		if (fault === null) {
			status = next.length > 0 ? 'valid' : 'idle';
			error = null;
			return;
		}

		if (status !== 'invalid') status = 'pending';
		timer = setTimeout(
			() => {
				timer = undefined;
				status = 'invalid';
				error = fault;
				message = fault;
			},
			Math.max(0, debounce)
		);
	}

	// Validation waits for the first blur; after that the field settles instantly.
	function commit() {
		touched = true;
		clearTimer();

		const fault = validate(value);
		if (fault === null) {
			status = value.length > 0 ? 'valid' : 'idle';
			error = null;
		} else {
			status = 'invalid';
			error = fault;
			message = fault;
		}
	}

	function handleInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		evaluate(event.currentTarget.value);
		onValueChange?.(event.currentTarget.value);
		oninput?.(event);
	}

	function handleBlur(event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		commit();
		onblur?.(event);
	}

	const invalid = $derived(status === 'invalid');
	const valid = $derived(status === 'valid');
	const described = $derived(
		[hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div data-slot="inline-validation" class={cn('w-full', className)}>
	<label for={fieldId} class="text-foreground block text-[13px] font-medium">
		{label}
	</label>

	<div class="relative mt-1.5">
		<input
			{...restProps}
			bind:value
			id={fieldId}
			{type}
			{placeholder}
			{disabled}
			{required}
			aria-required={required || undefined}
			aria-invalid={invalid || undefined}
			aria-describedby={described}
			oninput={handleInput}
			onblur={handleBlur}
			class={cn(
				'text-foreground placeholder:text-muted-foreground/70 h-10 w-full rounded-[10px] border-2 pr-9 pl-3 text-[13px] transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:outline-none disabled:opacity-50',
				invalid
					? 'border-destructive bg-card'
					: 'border-border bg-muted/50 focus:border-primary focus:bg-card shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] focus:shadow-none dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'
			)}
		/>

		<span
			class="pointer-events-none absolute top-1/2 right-3 grid size-3.5 -translate-y-1/2 place-items-center"
			aria-hidden="true"
		>
			<svg
				viewBox="0 0 12 12"
				width="14"
				height="14"
				fill="none"
				class="text-muted-foreground col-start-1 row-start-1"
				{@attach motionTo(() => ({
					keyframes: { opacity: valid ? 1 : 0, scale: valid ? 1 : 0.7 },
					transition: CROSSFADE
				}))}
			>
				<path
					d="M2 6.3 4.7 9 10 3.2"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<svg
				viewBox="0 0 12 12"
				width="14"
				height="14"
				fill="none"
				class="text-destructive col-start-1 row-start-1"
				{@attach motionTo(() => ({
					keyframes: { opacity: invalid ? 1 : 0, scale: invalid ? 1 : 0.7 },
					transition: CROSSFADE
				}))}
			>
				<path d="M6 2v4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
				<rect x="5.15" y="8.4" width="1.7" height="1.7" rx="0.5" fill="currentColor" />
			</svg>
		</span>
	</div>

	<div
		class="relative mt-1.5 grid"
		style:height={`${reserveLines * 16}px`}
		style:--reserve-lines={reserveLines}
	>
		{#if hint}
			<p
				aria-hidden="true"
				class="message-clamp text-muted-foreground col-start-1 row-start-1 text-[11.5px] leading-4"
				{@attach motionTo(() => ({
					keyframes: { opacity: invalid ? 0 : 1, y: invalid ? 3 : 0 },
					transition: CROSSFADE
				}))}
			>
				{hint}
			</p>
		{/if}

		<p
			aria-hidden="true"
			class="message-clamp text-destructive col-start-1 row-start-1 text-[11.5px] leading-4"
			{@attach motionTo(() => ({
				keyframes: { opacity: invalid ? 1 : 0, y: invalid ? 0 : -3 },
				transition: CROSSFADE
			}))}
		>
			{error ?? message}
		</p>

		{#if hint}
			<span id={hintId} class="sr-only">{hint}</span>
		{/if}

		<span id={errorId} role="status" aria-live="polite" aria-atomic="true" class="sr-only">
			{error ?? ''}
		</span>
	</div>
</div>

<style>
	.message-clamp {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: var(--reserve-lines);
		line-clamp: var(--reserve-lines);
		overflow: hidden;
	}
</style>
