<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	/** The shell widening, and the trigger sliding with its edge. */
	const DISCLOSE = { type: 'spring', stiffness: 380, damping: 38, mass: 0.7 } as const;
	/** The field and the trailing row fading in behind it. */
	const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
	/** The clear button popping in once there is something to clear. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	export type ExpandingSearchAlign = 'left' | 'right';

	export interface ExpandingSearchProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** The query. Bindable. */
		value?: string;
		/** Fires on every keystroke. Mirror state with it; do not run the search from here. */
		onChange?: (value: string) => void;
		/** Fires once the typing settles, and immediately on Enter. Hang the query off this one. */
		onSearch?: (value: string) => void;
		/** Enter. The pending debounce is flushed first, so `onSearch` never lands after it. */
		onSubmit?: (value: string) => void;
		/** Expansion state. Bindable — focus handling still runs when it is driven from outside. */
		open?: boolean;
		/** Called once per real transition, never twice for the same expand. */
		onOpenChange?: (open: boolean) => void;
		/** Milliseconds of quiet before `onSearch` fires. */
		debounce?: number;
		/** Collapse when focus leaves and the query is empty. A typed query is never collapsed away. */
		collapseOnBlur?: boolean;
		disabled?: boolean;
		label?: string;
		placeholder?: string;
		/** When supplied, reserves a tabular slot in the field and feeds the debounced live region. */
		resultCount?: number;
		/** Which edge of the reserved track the field is anchored to. */
		align?: ExpandingSearchAlign;
	}

	const COLLAPSED = 40;
	const TEXT_LEFT = 34;
	const CLEAR_SLOT = 35;
	const COUNT_SLOT = 38;
	const ANNOUNCE_DELAY = 500;

	let {
		class: className,
		value = $bindable(''),
		onChange,
		onSearch,
		onSubmit,
		open = $bindable(false),
		onOpenChange,
		debounce = 220,
		collapseOnBlur = true,
		disabled = false,
		label = 'Search',
		placeholder = 'Search',
		resultCount,
		align = 'right',
		...restProps
	}: ExpandingSearchProps = $props();

	const uid = $props.id();
	const inputId = `${uid}-field`;
	const liveId = `${uid}-live`;

	let root = $state<HTMLDivElement | null>(null);
	let field = $state<HTMLInputElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let focused = $state(false);
	let track = $state(0);
	let announced = $state('');

	let timer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	/** The track reserves the expanded width up front, so the row beside the field never reflows. */
	function measure(node: HTMLElement) {
		const read = (width: number) => {
			if (Math.abs(untrack(() => track) - width) >= 0.5) track = width;
		};

		read(node.getBoundingClientRect().width);

		const observer = new ResizeObserver((entries) => {
			const box = entries[0];
			if (box) read(box.contentRect.width);
		});
		observer.observe(node);

		return () => observer.disconnect();
	}

	function setOpen(next: boolean) {
		if (open === next) return;
		open = next;
		onOpenChange?.(next);
	}

	function commit(next: string) {
		value = next;
		onChange?.(next);
		if (timer) clearTimeout(timer);
		timer = setTimeout(
			() => {
				timer = null;
				onSearch?.(next);
			},
			Math.max(0, debounce)
		);
	}

	function flush() {
		if (!timer) return;
		clearTimeout(timer);
		timer = null;
		onSearch?.(value);
	}

	function expand() {
		if (disabled) return;
		setOpen(true);
		// Synchronous focus inside the handler — anything later loses the mobile keyboard.
		field?.focus();
	}

	function collapse(returnFocus = false) {
		setOpen(false);
		if (returnFocus) trigger?.focus();
	}

	function clear() {
		commit('');
		field?.focus();
	}

	function handleFocusOut(event: FocusEvent) {
		// SAFETY: relatedTarget on a focus event is the element receiving focus, always a Node
		// (or null when focus leaves the document entirely).
		const next = event.relatedTarget as Node | null;
		if (next && root?.contains(next)) return;
		focused = false;
		if (!collapseOnBlur) return;
		// A blur caused by switching browser tabs must not destroy a typed query.
		if (!document.hasFocus()) return;
		if (value.length > 0) return;
		setOpen(false);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (value.length > 0) {
				commit('');
				return;
			}
			collapse(true);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			flush();
			onSubmit?.(value);
		}
	}

	// The live region announces the settled count, not one message per character.
	$effect(() => {
		const shown = open && value.length > 0 && resultCount !== undefined;
		const count = resultCount;
		const query = value;

		const id = setTimeout(() => {
			announced = shown ? `${count} ${count === 1 ? 'result' : 'results'} for ${query}` : '';
		}, ANNOUNCE_DELAY);

		return () => clearTimeout(id);
	});

	const expanded = $derived(Math.max(COLLAPSED, track));
	const rightInset = $derived(CLEAR_SLOT + (resultCount === undefined ? 0 : COUNT_SLOT));
	const inner = $derived(Math.max(0, expanded - TEXT_LEFT - rightInset));
	const filled = $derived(value.length > 0);
</script>

<div
	{...restProps}
	bind:this={root}
	{@attach measure}
	role="search"
	data-slot="expanding-search"
	data-open={open ? '' : undefined}
	class={cn('relative h-10 w-full', className)}
	onfocusin={() => (focused = true)}
	onfocusout={handleFocusOut}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		{@attach motionTo(() => ({
			keyframes: { width: open ? expanded : COLLAPSED },
			transition: DISCLOSE
		}))}
		class={cn(
			'absolute inset-y-0 overflow-hidden rounded-[10px] border-2 transition-[background-color,border-color,box-shadow] duration-150',
			align === 'right' ? 'right-0' : 'left-0',
			focused
				? 'border-ring bg-card'
				: 'border-border bg-muted/60 shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'
		)}
		onmousedown={(event) => {
			if (event.target !== event.currentTarget) return;
			event.preventDefault();
			if (open) field?.focus();
		}}
	>
		<input
			bind:this={field}
			id={inputId}
			{value}
			type="search"
			{disabled}
			{placeholder}
			tabindex={open ? 0 : -1}
			aria-label={label}
			aria-describedby={liveId}
			autocomplete="off"
			spellcheck="false"
			enterkeyhint="search"
			style:width="{inner}px"
			style:left="{TEXT_LEFT}px"
			class="text-foreground placeholder:text-muted-foreground absolute inset-y-0 bg-transparent text-[13px] leading-9 outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
			{@attach motionTo(() => ({
				keyframes: { opacity: open ? 1 : 0 },
				// The text waits for the shell to have somewhere to put it.
				transition: { ...CROSSFADE, delay: open ? 0.06 : 0 }
			}))}
			oninput={(event) => commit(event.currentTarget.value)}
			onkeydown={handleKeyDown}
			onfocus={() => setOpen(true)}
		/>

		<div
			class="pointer-events-none absolute inset-y-0 right-[7px] flex items-center gap-1.5"
			{@attach motionTo(() => ({ keyframes: { opacity: open ? 1 : 0 }, transition: CROSSFADE }))}
		>
			{#if resultCount !== undefined}
				<span
					aria-hidden="true"
					class="text-muted-foreground w-8 truncate text-right font-mono text-[9.5px] tabular-nums"
				>
					{filled ? resultCount : ''}
				</span>
			{/if}

			<button
				type="button"
				tabindex={open && filled ? 0 : -1}
				aria-label="Clear search"
				aria-controls={inputId}
				onclick={clear}
				class={cn(
					'text-muted-foreground focus-visible:outline-ring grid size-[22px] place-items-center rounded-[6px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2',
					open && filled && 'pointer-events-auto'
				)}
				{@attach motionTo(() => ({
					keyframes: { opacity: filled ? 1 : 0, scale: filled ? 1 : 0.86 },
					transition: CELL
				}))}
			>
				<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
					<path
						d="M1.7 1.7 L9.3 9.3 M9.3 1.7 L1.7 9.3"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>
	</div>

	<button
		bind:this={trigger}
		type="button"
		{disabled}
		tabindex={open ? -1 : 0}
		aria-expanded={open}
		aria-label={label}
		aria-controls={inputId}
		onclick={expand}
		{@attach motionTo(() => ({
			keyframes: { x: align === 'right' && open ? -(expanded - COLLAPSED) : 0 },
			transition: DISCLOSE
		}))}
		class={cn(
			'text-muted-foreground focus-visible:outline-ring absolute inset-y-0 z-10 grid w-10 place-items-center rounded-[8px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-50',
			align === 'right' ? 'right-0' : 'left-0',
			open && 'pointer-events-none'
		)}
	>
		<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
			<circle cx="6.4" cy="6.4" r="4.5" stroke="currentColor" stroke-width="1.4" />
			<path
				d="M9.8 9.8 L13.2 13.2"
				stroke="currentColor"
				stroke-width="1.4"
				stroke-linecap="round"
			/>
		</svg>
	</button>

	<span id={liveId} aria-live="polite" class="sr-only">{announced}</span>
</div>
