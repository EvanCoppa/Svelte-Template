<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import SearchIcon from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import {
		normalizeOption,
		type ComboboxGroup,
		type ComboboxOption,
		type ComboboxOptionInput
	} from './combobox.js';

	/**
	 * The one dropdown in this app.
	 *
	 * A native `<select>` can't be styled, can't show a second line, can't be
	 * searched, and renders as a full-screen wheel on iOS — so every picker here
	 * is this component instead. It grows a search box on its own once the list
	 * passes `searchThreshold`, which is the difference between "pick a status"
	 * and "find one of 400 organizations".
	 *
	 * Single select:
	 *   <Combobox bind:value={stage} options={STAGE_OPTIONS} />
	 * Multi select:
	 *   <Combobox multiple bind:selected={columns} options={columnOptions} />
	 * In a POST form, `name` posts the value through a hidden input exactly like
	 * a native select would:
	 *   <Combobox name="leadStage" bind:value={form.stage} options={...} />
	 */

	interface ComboboxProps {
		/** Flat option list. Bare strings are accepted and become `{value, label}`. */
		options?: readonly ComboboxOptionInput[];
		/** Headed sections, for when the list genuinely has categories. */
		groups?: readonly ComboboxGroup[];
		/** When set, the selection is posted under this name via hidden input(s). */
		name?: string | undefined;
		/** Trigger text when nothing is selected. */
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		/** Only for a bare combobox. Inside a labelled field the `<label for>` supplies the name. */
		ariaLabel?: string | undefined;
		/** Must match the `for` of an external `<label>`. */
		id?: string | undefined;
		disabled?: boolean;
		required?: boolean;
		invalid?: boolean;
		/** Offer the search box at all. It still only appears past `searchThreshold`. */
		searchable?: boolean;
		/** Below this many options a search box is just noise, so it is dropped. */
		searchThreshold?: number;
		/** Show an X in the trigger that resets the selection. */
		clearable?: boolean;
		/** `sm` matches an h-8 toolbar control; `default` matches an h-9 form input. */
		size?: 'sm' | 'default';
		/** Leading icon in the trigger, before the label. Sized to 4 by the trigger. */
		icon?: Snippet;
		/** Classes for the trigger button — width lives here. */
		class?: string;
		/** Classes for the floating panel, e.g. a wider `w-80`. */
		contentClass?: string;
		/** Let the user pick several. Drives `selected` instead of `value`. */
		multiple?: boolean;
		/** Single-select value. Bind it, or pass it with `onchange`. */
		value?: string;
		/** Multi-select values. Used instead of `value` when `multiple` is set. */
		selected?: string[];
		/**
		 * Fires after the user picks — never for a programmatic change. Single-select
		 * only; the multi-select callback is `onSelectionChange`, kept apart so each
		 * one's argument type is inferred at the call site.
		 */
		onchange?: ((value: string) => void) | undefined;
		/** Fires with the whole new selection in `multiple` mode. */
		onSelectionChange?: ((values: string[]) => void) | undefined;
	}

	export type { ComboboxProps };

	let {
		options,
		groups,
		name,
		value = $bindable(''),
		selected = $bindable([]),
		multiple = false,
		placeholder = 'Select…',
		searchPlaceholder = 'Search…',
		emptyText = 'No matches',
		ariaLabel,
		id,
		disabled = false,
		required = false,
		invalid = false,
		searchable = true,
		searchThreshold = 8,
		clearable = false,
		size = 'default',
		icon,
		class: className = '',
		contentClass = '',
		onchange,
		onSelectionChange
	}: ComboboxProps = $props();

	/**
	 * The panel is `fixed`, so an `overflow-hidden` card or a scrolling dialog body
	 * can't clip it. Everything below is measured in viewport pixels and then
	 * rebased onto the containing block in `position()`.
	 */
	const PANEL_GAP = 4;
	const VIEWPORT_GUTTER = 8;
	const PANEL_MAX_H = 320;
	/** Floor only guards a trigger scrolled off-screen: `position()` already opens
	 *  against whichever side has more room, so the panel normally fits where it lands. */
	const PANEL_MIN_H = 120;
	const PANEL_MIN_W = 224;

	let root = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();
	let searchInput = $state<HTMLInputElement>();
	let listbox = $state<HTMLDivElement>();
	let open = $state(false);
	let panelStyle = $state('');
	let query = $state('');
	/**
	 * Where the keyboard highlight sits. Read through `activeIndex`, which clamps
	 * it to what is actually on screen — filtering shrinks the list under the cursor.
	 */
	let activeCursor = $state(-1);

	const uid = $props.id();
	const triggerId = $derived(id ?? `${uid}-trigger`);
	const listboxId = `${uid}-listbox`;
	const optionId = (index: number) => `${uid}-option-${index}`;

	/** One shape downstream: a flat `options` list becomes a lone group with no heading. */
	const resolvedGroups = $derived<readonly ComboboxGroup[]>(
		groups ?? [{ label: null, options: (options ?? []).map(normalizeOption) }]
	);

	const allOptions = $derived(resolvedGroups.flatMap((group) => group.options));
	const showSearch = $derived(searchable && allOptions.length >= searchThreshold);

	const selectedValues = $derived(multiple ? selected : value ? [value] : []);
	const hasSelection = $derived(selectedValues.length > 0);

	const triggerLabel = $derived.by(() => {
		if (!hasSelection) return placeholder;
		if (!multiple || selectedValues.length === 1) {
			const match = allOptions.find((option) => option.value === selectedValues[0]);
			return match?.label ?? selectedValues[0];
		}
		return `${selectedValues.length} selected`;
	});

	const needle = $derived(query.trim().toLowerCase());

	/**
	 * Groups keep their identity while filtering so headings stay put; a group whose
	 * options all fall away is dropped rather than left as a bare heading.
	 */
	const visibleGroups = $derived(
		(needle
			? resolvedGroups.map((group) => ({
					...group,
					options: group.options.filter(
						(option) =>
							option.label.toLowerCase().includes(needle) ||
							(option.sublabel ?? '').toLowerCase().includes(needle)
					)
				}))
			: resolvedGroups
		).filter((group) => group.options.length > 0)
	);

	/**
	 * Arrow keys walk the options as one flat list, jumping group boundaries — the
	 * headings are labels, not stops. An index into this list is what `activeIndex` means.
	 */
	const flatOptions = $derived(visibleGroups.flatMap((group) => group.options));

	const activeIndex = $derived(
		flatOptions.length === 0 ? -1 : Math.min(Math.max(activeCursor, 0), flatOptions.length - 1)
	);

	/** Whichever control has focus owns the highlight announcement. */
	const activeDescendant = $derived(activeIndex >= 0 ? optionId(activeIndex) : undefined);

	/** Index of a group's first option within `flatOptions`, so rows can address themselves. */
	const groupOffsets = $derived.by(() => {
		const offsets: number[] = [];
		let total = 0;
		for (const group of visibleGroups) {
			offsets.push(total);
			total += group.options.length;
		}
		return offsets;
	});

	function isSelected(optionValue: string): boolean {
		return multiple ? selected.includes(optionValue) : value === optionValue;
	}

	/**
	 * `position: fixed` resolves against the viewport *unless* an ancestor establishes
	 * a containing block — then the panel's coordinates are read against that
	 * ancestor's box instead, and a viewport figure lands wherever the ancestor
	 * happens to sit. Dialog content is exactly that case, so find the ancestor and
	 * rebase onto it.
	 *
	 * `translate`/`rotate`/`scale` are checked separately from `transform` on purpose:
	 * Tailwind v4 compiles `-translate-x-1/2` to the standalone `translate` property,
	 * which leaves computed `transform` reading `none` while still establishing the
	 * containing block. Checking `transform` alone silently misses every dialog.
	 */
	function containingBlock(
		el: HTMLElement | undefined
	): { left: number; top: number; bottom: number } | null {
		for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
			const style = getComputedStyle(node);
			if (
				style.transform !== 'none' ||
				(style.translate ?? 'none') !== 'none' ||
				(style.rotate ?? 'none') !== 'none' ||
				(style.scale ?? 'none') !== 'none' ||
				style.perspective !== 'none' ||
				style.filter !== 'none' ||
				(style.backdropFilter ?? 'none') !== 'none' ||
				(style.containerType ?? 'normal') !== 'normal' ||
				/paint|layout|strict|content/.test(style.contain) ||
				/transform|translate|rotate|scale|perspective|filter/.test(style.willChange)
			) {
				// The containing block is the ancestor's *padding* box, so trim its border
				// off the border box `getBoundingClientRect` hands back.
				const rect = node.getBoundingClientRect();
				return {
					left: rect.left + node.clientLeft,
					top: rect.top + node.clientTop,
					bottom: rect.bottom - (node.offsetHeight - node.clientTop - node.clientHeight)
				};
			}
		}
		return null;
	}

	/** Anchor the panel to the trigger, flipping up when the space below is cramped. */
	function position() {
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const host = containingBlock(trigger);
		const originX = host?.left ?? 0;
		const originY = host?.top ?? 0;
		const hostBottom = host?.bottom ?? window.innerHeight;

		const width = Math.max(rect.width, PANEL_MIN_W);
		const left = Math.max(
			VIEWPORT_GUTTER,
			Math.min(rect.left, window.innerWidth - width - VIEWPORT_GUTTER)
		);
		const below = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_GUTTER;
		const above = rect.top - PANEL_GAP - VIEWPORT_GUTTER;
		const up = below < PANEL_MAX_H && above > below;
		const maxHeight = Math.max(PANEL_MIN_H, Math.min(PANEL_MAX_H, up ? above : below));
		const vertical = up
			? `bottom:${hostBottom - rect.top + PANEL_GAP}px`
			: `top:${rect.bottom + PANEL_GAP - originY}px`;
		panelStyle = `left:${left - originX}px;width:${width}px;${vertical};max-height:${maxHeight}px`;
	}

	function scrollActiveIntoView() {
		if (activeIndex < 0) return;
		listbox
			?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)
			?.scrollIntoView({ block: 'nearest' });
	}

	function setActive(index: number, scroll = true) {
		if (flatOptions.length === 0) {
			activeCursor = -1;
			return;
		}
		// Wrap, so Down on the last row lands back on the first.
		const count = flatOptions.length;
		activeCursor = ((index % count) + count) % count;
		if (scroll) scrollActiveIntoView();
	}

	function openMenu() {
		if (disabled) return;
		open = true;
		query = '';
		const index = flatOptions.findIndex((option) => isSelected(option.value));
		activeCursor = index >= 0 ? index : 0;
		// The list renders on the next tick; place, focus and scroll once it exists.
		queueMicrotask(() => {
			position();
			searchInput?.focus();
			scrollActiveIntoView();
		});
	}

	function closeMenu(refocus = true) {
		if (!open) return;
		open = false;
		query = '';
		activeCursor = -1;
		if (refocus) trigger?.focus();
	}

	function selectOption(option: ComboboxOption) {
		if (option.disabled) return;
		if (multiple) {
			// The panel stays open: picking three columns shouldn't cost three round trips.
			selected = selected.includes(option.value)
				? selected.filter((v) => v !== option.value)
				: [...selected, option.value];
			onSelectionChange?.(selected);
			return;
		}
		value = option.value;
		closeMenu();
		onchange?.(value);
	}

	function clear(event?: MouseEvent) {
		event?.stopPropagation();
		if (multiple) {
			selected = [];
			onSelectionChange?.(selected);
		} else {
			value = '';
			onchange?.(value);
		}
	}

	function onKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (!open) openMenu();
				else setActive(activeIndex + 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (!open) openMenu();
				else setActive(activeIndex - 1);
				break;
			case 'Home':
				if (!open) return;
				event.preventDefault();
				setActive(0);
				break;
			case 'End':
				if (!open) return;
				event.preventDefault();
				setActive(flatOptions.length - 1);
				break;
			case 'Enter': {
				// Never let Enter reach the surrounding form: opening a picker is not a submit.
				event.preventDefault();
				if (!open) {
					openMenu();
					return;
				}
				const option = flatOptions[activeIndex];
				if (option) selectOption(option);
				break;
			}
			case ' ':
				// Only the trigger treats space as "open" — inside the search box it types.
				if (open) return;
				event.preventDefault();
				openMenu();
				break;
			case 'Escape':
				if (!open) return;
				event.preventDefault();
				// A wrapping dialog listens for Escape on the document; dismissing this
				// option list must not also throw away everything typed into that dialog.
				event.stopPropagation();
				closeMenu();
				break;
			case 'Tab':
				// Tabbing away commits nothing and closes. Focus returns to the trigger first
				// so the browser's own tab step starts from a node still in the document.
				closeMenu();
				break;
		}
	}

	function onPointerdown(event: PointerEvent) {
		if (!open || !root) return;
		if (event.target instanceof Node && !root.contains(event.target)) closeMenu(false);
	}

	$effect(() => {
		if (!open) return;
		const reposition = () => position();
		// Capture, so a scrolling card or dialog body moves the panel with the trigger.
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return () => {
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	});
</script>

<svelte:window onpointerdown={onPointerdown} />

<div bind:this={root} class="relative">
	{#if name}
		<!-- `disabled` mirrors a native select: a disabled control submits nothing. -->
		{#each selectedValues as posted (posted)}
			<input type="hidden" {name} value={posted} {disabled} />
		{/each}
		{#if selectedValues.length === 0}
			<input type="hidden" {name} value="" {disabled} />
		{/if}
	{/if}

	<button
		bind:this={trigger}
		type="button"
		{disabled}
		id={triggerId}
		role="combobox"
		aria-label={ariaLabel}
		aria-required={required || undefined}
		aria-invalid={invalid || undefined}
		aria-controls={listboxId}
		aria-expanded={open}
		aria-haspopup="listbox"
		aria-activedescendant={open && !showSearch ? activeDescendant : undefined}
		onclick={() => (open ? closeMenu(false) : openMenu())}
		onkeydown={onKeydown}
		class={cn(
			'border-input bg-background text-foreground flex w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm transition-colors',
			'hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:outline-none',
			'disabled:cursor-not-allowed disabled:opacity-50',
			size === 'sm' ? 'h-8' : 'h-9',
			invalid && 'border-destructive',
			className
		)}
	>
		<span class="flex min-w-0 items-center gap-2">
			{#if icon}
				<span class="flex shrink-0 items-center [&_svg]:size-4">
					{@render icon()}
				</span>
			{/if}
			<span class={cn('truncate', hasSelection ? 'font-medium' : 'text-muted-foreground')}>
				{triggerLabel}
			</span>
		</span>
		<span class="flex shrink-0 items-center gap-1">
			{#if clearable && hasSelection && !disabled}
				<span
					role="button"
					tabindex="-1"
					aria-label="Clear selection"
					onclick={clear}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') clear();
					}}
					class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-0.5"
				>
					<X class="h-3.5 w-3.5" />
				</span>
			{/if}
			<ChevronDown aria-hidden="true" class="text-muted-foreground h-4 w-4 shrink-0" />
		</span>
	</button>

	{#if open}
		<div
			class={cn(
				'border-border bg-popover text-popover-foreground fixed z-50 flex flex-col overflow-hidden rounded-md border shadow-lg',
				contentClass
			)}
			style={panelStyle}
		>
			{#if showSearch}
				<div class="border-border relative border-b p-1.5">
					<SearchIcon
						aria-hidden="true"
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2"
					/>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:this={searchInput}
						bind:value={query}
						autofocus
						type="text"
						aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search options'}
						aria-controls={listboxId}
						aria-autocomplete="list"
						aria-activedescendant={activeDescendant}
						placeholder={searchPlaceholder}
						oninput={() => (activeCursor = 0)}
						onkeydown={onKeydown}
						class="text-foreground placeholder:text-muted-foreground h-7 w-full rounded border-0 bg-transparent pr-2 pl-7 text-sm focus:outline-none"
					/>
				</div>
			{/if}

			<div
				bind:this={listbox}
				id={listboxId}
				role="listbox"
				aria-label={ariaLabel}
				aria-multiselectable={multiple || undefined}
				class="flex-1 overflow-y-auto p-1"
			>
				{#each visibleGroups as group, groupIndex (group.label ?? `group-${groupIndex}`)}
					{@const offset = groupOffsets[groupIndex] ?? 0}
					<div role="group" aria-label={group.label ?? undefined}>
						{#if group.label}
							<div
								class="bg-popover text-muted-foreground sticky top-0 z-10 flex items-baseline gap-2 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase"
							>
								<span>{group.label}</span>
								{#if group.hint}
									<span class="font-normal tracking-normal normal-case opacity-70">
										{group.hint}
									</span>
								{/if}
							</div>
						{/if}
						{#each group.options as option, index (option.value)}
							{@const flatIndex = offset + index}
							{@const active = isSelected(option.value)}
							<button
								type="button"
								id={optionId(flatIndex)}
								role="option"
								tabindex="-1"
								aria-selected={active}
								aria-disabled={option.disabled || undefined}
								disabled={option.disabled}
								onclick={() => selectOption(option)}
								onmouseenter={() => setActive(flatIndex, false)}
								onkeydown={onKeydown}
								style:padding-left="{0.5 + (option.depth ?? 0) * 0.875}rem"
								class={cn(
									'text-muted-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 text-left text-sm',
									flatIndex === activeIndex && 'bg-accent text-accent-foreground',
									active && 'text-foreground font-medium',
									option.disabled && 'cursor-not-allowed opacity-40'
								)}
							>
								<span class="text-primary flex h-3.5 w-3.5 shrink-0 items-center justify-center">
									{#if active}<Check aria-hidden="true" class="h-3.5 w-3.5" />{/if}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate">{option.label}</span>
									{#if option.sublabel}
										<span class="text-muted-foreground block truncate text-xs">
											{option.sublabel}
										</span>
									{/if}
								</span>
								{#if option.hint !== null && option.hint !== undefined && option.hint !== ''}
									<span class="text-muted-foreground shrink-0 text-xs tabular-nums">
										{option.hint}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground px-3 py-6 text-center text-sm">
						{needle ? `No matches for “${query}”.` : emptyText}
					</p>
				{/each}
			</div>

			{#if multiple && hasSelection}
				<div class="border-border border-t p-1">
					<button
						type="button"
						onclick={() => clear()}
						class="text-primary hover:bg-accent w-full rounded-sm px-3 py-1.5 text-left text-xs font-medium"
					>
						Clear {selectedValues.length} selected
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
