<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** The label lifting into the notch. Stiff, so it keeps up with the caret. */
	const LIFT = { type: 'spring', stiffness: 760, damping: 46, mass: 0.5 } as const;
	const RAISE = -32;
	const SLIDE = -12;
	const SHRINK = 0.92;

	export interface FloatingLabelInputProps extends Omit<
		HTMLInputAttributes,
		'value' | 'class' | 'children'
	> {
		label: string;
		value?: string;
		hint?: string;
		invalid?: boolean;
		class?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		class: className,
		label,
		value = $bindable(''),
		hint,
		invalid = false,
		id,
		type = 'text',
		maxlength,
		required = false,
		disabled = false,
		readonly = false,
		onValueChange,
		onfocus,
		onblur,
		oninput,
		onchange,
		...restProps
	}: FloatingLabelInputProps = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? `${uid}-field`);
	const hintId = `${uid}-hint`;

	let focused = $state(false);

	const raised = $derived((focused && !disabled) || value.length > 0);

	function handleFocus(event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		focused = true;
		onfocus?.(event);
	}

	function handleBlur(event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		focused = false;
		onblur?.(event);
	}

	function handleInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		onValueChange?.(event.currentTarget.value);
		oninput?.(event);
	}

	function handleChange(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		// A value the browser restores or a password manager writes still raises
		// the label: native change syncs state even without an input event.
		value = event.currentTarget.value;
		onchange?.(event);
	}
</script>

<div data-slot="floating-label" class={cn('w-full', className)}>
	<div class="relative pt-5">
		<div
			class={cn(
				'relative h-10 rounded-[10px] border-2 transition-[background-color,border-color,box-shadow] duration-150',
				invalid
					? 'border-destructive bg-card'
					: focused
						? 'border-primary bg-card'
						: 'border-border bg-muted/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]',
				disabled && 'opacity-55'
			)}
		>
			<input
				{...restProps}
				bind:value
				id={fieldId}
				{type}
				{maxlength}
				{required}
				{disabled}
				{readonly}
				aria-required={required || undefined}
				aria-invalid={invalid || undefined}
				aria-describedby={hint ? hintId : undefined}
				onfocus={handleFocus}
				onblur={handleBlur}
				oninput={handleInput}
				onchange={handleChange}
				class="text-foreground absolute inset-0 h-full w-full rounded-[9px] bg-transparent px-3 py-0 text-[13px] leading-5 outline-none focus-visible:outline-none disabled:cursor-not-allowed"
			/>
		</div>

		<label
			for={fieldId}
			class={cn(
				'absolute top-8 left-3 block cursor-text text-[13px] leading-4 transition-colors duration-150 select-none',
				invalid ? 'text-destructive' : raised ? 'text-foreground/75' : 'text-muted-foreground'
			)}
			style:will-change="transform"
			{@attach motionTo(() => ({
				keyframes: {
					// The pivot is the label's own top-left, so shrinking it keeps the
					// first glyph exactly where the placeholder had it.
					originX: 0,
					originY: 0,
					y: raised ? RAISE : 0,
					x: raised ? SLIDE : 0,
					scale: raised ? SHRINK : 1
				},
				transition: LIFT
			}))}
		>
			{label}
			{#if required}
				<span aria-hidden="true" class="text-muted-foreground ml-0.5">*</span>
			{/if}
		</label>
	</div>

	<div class="mt-1.5 flex h-4 items-start gap-3">
		<p
			aria-hidden="true"
			class={cn(
				'min-w-0 flex-1 truncate text-[11.5px] leading-4',
				invalid ? 'text-destructive' : 'text-muted-foreground'
			)}
		>
			{hint}
		</p>

		{#if maxlength !== undefined && maxlength !== null}
			<span
				aria-hidden="true"
				class="text-muted-foreground/80 grid shrink-0 justify-items-end font-mono text-[10.5px] leading-4 tabular-nums"
			>
				<span class="invisible col-start-1 row-start-1">{maxlength} / {maxlength}</span>
				<span class="col-start-1 row-start-1">{value.length} / {maxlength}</span>
			</span>
		{/if}

		{#if hint}
			<span id={hintId} class="sr-only">{hint}</span>
		{/if}
	</div>
</div>
