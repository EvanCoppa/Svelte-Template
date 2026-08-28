<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { animate } from 'motion';
	import { cn } from '$lib/utils.js';
	import { reducedMotion } from '$lib/motion.js';

	export interface SegmentedOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	export interface SegmentedControlProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'onchange'
	> {
		/** Each is { value, label, disabled? }. Segments are equal width, sized to the widest label. */
		options: SegmentedOption[];
		/** Accessible name for the radiogroup. Required — an unlabelled group announces nothing. */
		label: string;
		/** Selected value. Bindable; omit it and the control keeps its own. */
		value?: string;
		/** Uncontrolled starting selection. Falls back to the first option. */
		defaultValue?: string;
		/** Fires only when the selection actually changes, never on a re-select. */
		onValueChange?: (value: string) => void;
	}

	/** Framer's `{ stiffness: 520, damping: 34, mass: 0.45 }` from the original. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	const SEG =
		'px-3 py-[7px] text-center text-[13px] leading-[18px] font-medium tracking-[-0.01em] whitespace-nowrap';

	let {
		class: className,
		options,
		label,
		defaultValue,
		value = $bindable(defaultValue ?? options[0]?.value ?? ''),
		onValueChange,
		...restProps
	}: SegmentedControlProps = $props();

	const count = $derived(Math.max(1, options.length));
	const template = $derived(`repeat(${count}, minmax(0, 1fr))`);
	const index = $derived(
		Math.max(
			0,
			options.findIndex((option) => option.value === value)
		)
	);

	let hovered = $state(-1);
	let buttons: (HTMLButtonElement | undefined)[] = $state([]);
	let thumbEl: HTMLSpanElement | undefined = $state();
	let maskEl: HTMLSpanElement | undefined = $state();

	let placed = false;
	$effect(() => {
		const thumb = thumbEl;
		const mask = maskEl;
		const at = index;
		if (!thumb || !mask) return;

		const still = !placed || reducedMotion.current;
		placed = true;
		const motion = still ? { duration: 0 } : CELL;

		const forward = animate(thumb, { x: `${at * 100}%` }, motion);
		const backward = animate(mask, { x: `${at * -100}%` }, motion);

		return () => {
			forward.stop();
			backward.stop();
		};
	});

	function select(next: string) {
		if (next === value) return;
		value = next;
		onValueChange?.(next);
	}

	function seek(from: number, dir: number) {
		let i = from;
		for (let k = 0; k < count; k += 1) {
			i = (i + dir + count) % count;
			if (!options[i]?.disabled) return i;
		}
		return from;
	}

	function go(i: number) {
		const option = options[i];
		if (!option || option.disabled) return;
		buttons[i]?.focus();
		select(option.value);
	}

	function onKeyDown(event: KeyboardEvent, i: number) {
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			event.preventDefault();
			go(seek(i, 1));
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			event.preventDefault();
			go(seek(i, -1));
		} else if (event.key === 'Home') {
			event.preventDefault();
			go(seek(count - 1, 1));
		} else if (event.key === 'End') {
			event.preventDefault();
			go(seek(0, -1));
		}
	}
</script>

<div
	{...restProps}
	role="radiogroup"
	aria-label={label}
	data-slot="segmented-control"
	onpointerleave={() => (hovered = -1)}
	class={cn(
		'border-border bg-muted/70 relative inline-block rounded-[9px] border p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] select-none dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]',
		className
	)}
>
	<div class="relative grid [touch-action:manipulation]" style:grid-template-columns={template}>
		{#each options as option, i (option.value)}
			<span
				aria-hidden="true"
				class={cn(
					SEG,
					'pointer-events-none transition-colors duration-150',
					option.disabled
						? 'text-muted-foreground/50'
						: hovered === i && i !== index
							? 'text-foreground'
							: 'text-muted-foreground'
				)}
			>
				{option.label}
			</span>
		{/each}

		<span
			bind:this={thumbEl}
			aria-hidden="true"
			class="bg-primary pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[6px] shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
			style:width={`${100 / count}%`}
		>
			<span bind:this={maskEl} class="absolute inset-0 block">
				<span
					class="absolute inset-y-0 left-0 grid"
					style:width={`${count * 100}%`}
					style:grid-template-columns={template}
				>
					{#each options as option (option.value)}
						<span class={cn(SEG, 'text-primary-foreground')}>{option.label}</span>
					{/each}
				</span>
			</span>
		</span>

		<div class="absolute inset-0 grid" style:grid-template-columns={template}>
			{#each options as option, i (option.value)}
				<button
					bind:this={buttons[i]}
					type="button"
					role="radio"
					aria-checked={i === index}
					aria-disabled={option.disabled ? true : undefined}
					tabindex={i === index ? 0 : -1}
					onclick={() => {
						if (!option.disabled) select(option.value);
					}}
					onkeydown={(event) => onKeyDown(event, i)}
					onpointerenter={() => {
						if (!option.disabled) hovered = i;
					}}
					class="focus-visible:bg-primary/5 cursor-default rounded-[6px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]"
				>
					<span class="sr-only">{option.label}</span>
				</button>
			{/each}
		</div>
	</div>
</div>
