<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/** A hairline rule. It is skipped by every form of navigation. */
	export interface ContextMenuSeparator {
		id: string;
		type: 'separator';
	}

	export interface ContextMenuAction {
		id: string;
		type?: 'item';
		label: string;
		/** Drawn right-aligned, e.g. '⌘L'. Decorative — bind the real accelerator yourself. */
		shortcut?: string;
		/** Optional leading glyph. One item with an icon indents the whole menu. */
		icon?: Snippet;
		disabled?: boolean;
		/** Runs after the menu closes and focus is back on the trigger. */
		onSelect?: (id: string) => void;
	}

	export type ContextMenuItem = ContextMenuSeparator | ContextMenuAction;

	export interface ContextMenuPlacement {
		left: number;
		top: number;
		width: number;
		maxHeight: number;
		transformOrigin: string;
	}

	const ITEM_H = 32;
	const SEP_H = 9;
	const PAD = 5;
	const BORDER = 1;

	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), Math.max(min, max));
	}

	/** Height is derived from the list before the first paint — the menu never measures itself. */
	function measure(items: ContextMenuItem[]) {
		let height = PAD * 2 + BORDER * 2;
		for (const item of items) height += item.type === 'separator' ? SEP_H : ITEM_H;
		return height;
	}
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, motionTransition } from '$lib/motion.js';

	export interface ContextMenuProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'onselect'
	> {
		/** Rows to draw. Order and count decide the panel's height before it paints. */
		items: ContextMenuItem[];
		/** The surface the menu belongs to. It becomes the focusable trigger. */
		children?: Snippet;
		/** Fires with the chosen id after the menu closed and focus returned. */
		onSelect?: (id: string) => void;
		/** aria-label on the menu. Name it after the row it acts on. */
		label?: string;
		/** Panel width in px, narrowed when the viewport cannot hold it. */
		width?: number;
		/** Blocks every opener and takes the trigger out of the tab order. */
		disabled?: boolean;
		/** Touch hold, in ms, before the menu opens. */
		holdDuration?: number;
		/** Movement, in px, that cancels an in-flight hold. */
		moveTolerance?: number;
		/** Gap kept between the panel and every viewport edge. */
		margin?: number;
	}

	let {
		class: className = '',
		items,
		children,
		onSelect,
		label = 'Context menu',
		width = 224,
		disabled = false,
		holdDuration = 460,
		moveTolerance = 8,
		margin = 8,
		...restProps
	}: ContextMenuProps = $props();

	const uid = $props.id();
	const menuId = `${uid}-menu`;
	const hintId = `${uid}-hint`;

	let placement = $state<ContextMenuPlacement | null>(null);
	let active = $state(-1);
	let mounted = $state(false);

	let triggerEl = $state<HTMLDivElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let itemEls = $state<(HTMLButtonElement | null)[]>([]);

	let hold: ReturnType<typeof setTimeout> | null = null;
	let holdFrom: { x: number; y: number } | null = null;
	let queryTimer: ReturnType<typeof setTimeout> | null = null;
	let query = '';
	let swallowClick = false;
	let pressed = -1;

	const isOpen = $derived(placement !== null);
	const height = $derived(measure(items));
	/** Indices the keyboard may land on: no separators, no disabled rows. */
	const steps = $derived(
		items.reduce<number[]>((acc, item, index) => {
			if (item.type !== 'separator' && !item.disabled) acc.push(index);
			return acc;
		}, [])
	);
	const hasIcons = $derived(items.some((item) => item.type !== 'separator' && item.icon));
	const host = $derived(mounted ? document.body : null);

	onMount(() => {
		mounted = true;
	});

	onDestroy(() => {
		if (hold !== null) clearTimeout(hold);
		if (queryTimer !== null) clearTimeout(queryTimer);
	});

	// The active row owns DOM focus, so screen readers follow the menu itself.
	$effect(() => {
		if (!placement) return;
		const node = active >= 0 ? itemEls[active] : menuEl;
		node?.focus({ preventScroll: true });
		if (active >= 0) node?.scrollIntoView({ block: 'nearest' });
	});

	function clearHold() {
		if (hold !== null) clearTimeout(hold);
		hold = null;
		holdFrom = null;
	}

	function close(restoreFocus = false) {
		clearHold();
		if (placement === null) return;
		placement = null;
		active = -1;
		if (restoreFocus) triggerEl?.focus({ preventScroll: true });
	}

	/**
	 * Places the panel at the pointer, flipping to the other side of it near an
	 * edge and clamping to `margin`. transformOrigin is the exact pixel the
	 * press landed on, so the menu grows out of the click.
	 */
	function openAt(x: number, y: number, source: 'pointer' | 'keyboard' = 'pointer') {
		if (disabled || items.length === 0) return;

		const vw = document.documentElement.clientWidth;
		const vh = document.documentElement.clientHeight;
		const w = Math.min(width, Math.max(160, vw - margin * 2));
		const cap = Math.max(ITEM_H + PAD * 2, vh - margin * 2);
		const h = Math.min(height, cap);

		const left = clamp(x + w + margin <= vw ? x : x - w, margin, vw - w - margin);
		const top = clamp(y + h + margin <= vh ? y : y - h, margin, vh - h - margin);

		pressed = -1;
		itemEls = [];
		placement = {
			left,
			top,
			width: w,
			maxHeight: cap,
			transformOrigin: `${clamp(x - left, 0, w)}px ${clamp(y - top, 0, h)}px`
		};
		active = source === 'keyboard' ? (steps[0] ?? -1) : -1;
	}

	function choose(index: number) {
		const item = items[index];
		if (!item || item.type === 'separator' || item.disabled) return;
		close(true);
		item.onSelect?.(item.id);
		onSelect?.(item.id);
	}

	function step(dir: 1 | -1) {
		if (steps.length === 0) return;
		const at = steps.indexOf(active);
		active =
			at === -1
				? dir === 1
					? steps[0]
					: steps[steps.length - 1]
				: steps[(at + dir + steps.length) % steps.length];
	}

	function edge(which: 'first' | 'last') {
		if (steps.length === 0) return;
		active = which === 'first' ? steps[0] : steps[steps.length - 1];
	}

	function typeahead(char: string) {
		query += char.toLowerCase();
		if (queryTimer !== null) clearTimeout(queryTimer);
		queryTimer = setTimeout(() => {
			query = '';
		}, 600);

		const from = steps.indexOf(active) + 1;
		for (let k = 0; k < steps.length; k += 1) {
			const index = steps[(from + k) % steps.length];
			const item = items[index];
			if (item.type !== 'separator' && item.label.toLowerCase().startsWith(query)) {
				active = index;
				return;
			}
		}
	}

	function portalTo(target: HTMLElement) {
		return (node: Element) => {
			target.appendChild(node);
		};
	}

	function onTriggerContextMenu(event: MouseEvent) {
		if (disabled) return;
		event.preventDefault();
		event.stopPropagation();
		clearHold();
		openAt(event.clientX, event.clientY, 'pointer');
	}

	function onTriggerKeydown(event: KeyboardEvent) {
		if (disabled || isOpen) return;
		const wants =
			event.key === 'ContextMenu' ||
			(event.shiftKey && event.key === 'F10') ||
			(event.key === 'Enter' && event.target === event.currentTarget);
		if (!wants) return;
		event.preventDefault();
		// SAFETY: currentTarget is the trigger div this handler is bound to, always an HTMLElement.
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		openAt(Math.round(rect.left + 14), Math.round(rect.top + 14), 'keyboard');
	}

	function onTriggerPointerDown(event: PointerEvent) {
		if (disabled || event.pointerType === 'mouse' || isOpen) return;
		const x = event.clientX;
		const y = event.clientY;
		holdFrom = { x, y };
		hold = setTimeout(() => {
			hold = null;
			swallowClick = true;
			navigator.vibrate?.(10);
			openAt(x, y, 'pointer');
		}, holdDuration);
	}

	function onTriggerPointerMove(event: PointerEvent) {
		if (hold === null || !holdFrom) return;
		if (Math.hypot(event.clientX - holdFrom.x, event.clientY - holdFrom.y) > moveTolerance) {
			clearHold();
		}
	}

	function onTriggerClick(event: MouseEvent) {
		if (!swallowClick) return;
		swallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function onMenuKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			step(event.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			edge(event.key === 'Home' ? 'first' : 'last');
			return;
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			close(true);
			return;
		}
		if (
			event.key.length === 1 &&
			event.key !== ' ' &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey
		) {
			typeahead(event.key);
		}
	}

	function onItemPointerMove(index: number) {
		const item = items[index];
		if (active === index || item.type === 'separator' || item.disabled) return;
		active = index;
	}

	/**
	 * An item activates only when its own pointerdown landed on it, so the
	 * compatibility click fired as a long-pressing finger lifts cannot select
	 * whatever the menu just placed underneath it.
	 */
	function onItemClick(event: MouseEvent, index: number) {
		if (event.detail !== 0 && pressed !== index) return;
		pressed = -1;
		choose(index);
	}

	function onDocumentPointerDown(event: PointerEvent) {
		if (!isOpen) return;
		// SAFETY: a pointer event's target dispatched within the document is always a Node.
		if (menuEl?.contains(event.target as Node)) return;
		// SAFETY: a pointer event's target dispatched within the document is always a Node.
		if (event.button === 2 && triggerEl?.contains(event.target as Node)) return;
		close(false);
	}

	function onDocumentScroll(event: Event) {
		if (!isOpen) return;
		// SAFETY: a scroll event's target dispatched within the document is always a Node.
		if (menuEl?.contains(event.target as Node)) return;
		close(false);
	}

	function onDocumentKeydown(event: KeyboardEvent) {
		if (!isOpen || event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		close(true);
	}

	function bail() {
		if (isOpen) close(false);
	}

	function menuIn(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1], scale: [0.96, 1] },
			transition: { duration: 0.2, ease: EASE },
			reduced: { keyframes: { opacity: [0, 1] }, transition: { duration: 0 } }
		});
	}

	function menuOut(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0, scale: 0.98 },
			transition: { duration: 0.14, ease: EXIT },
			reduced: { keyframes: { opacity: 0 }, transition: { duration: 0 } }
		});
	}
</script>

<svelte:window onresize={bail} onblur={bail} />
<svelte:document
	onpointerdowncapture={onDocumentPointerDown}
	onscrollcapture={onDocumentScroll}
	onkeydowncapture={onDocumentKeydown}
/>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	{...restProps}
	bind:this={triggerEl}
	tabindex={disabled ? -1 : 0}
	aria-haspopup="menu"
	aria-expanded={isOpen}
	aria-controls={isOpen ? menuId : undefined}
	aria-describedby={hintId}
	style="touch-action: manipulation; -webkit-touch-callout: none;"
	oncontextmenu={onTriggerContextMenu}
	onkeydown={onTriggerKeydown}
	onpointerdown={onTriggerPointerDown}
	onpointermove={onTriggerPointerMove}
	onpointerup={clearHold}
	onpointercancel={clearHold}
	onpointerleave={clearHold}
	onclick={onTriggerClick}
	class={cn(
		'focus-visible:bg-ring/10 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]',
		className
	)}
>
	{@render children?.()}
	<span id={hintId} class="sr-only">Right-click, or press Shift plus F10, for options</span>
</div>

{#if placement && host}
	<div
		{@attach portalTo(host)}
		bind:this={menuEl}
		id={menuId}
		role="menu"
		tabindex="-1"
		aria-orientation="vertical"
		aria-label={label}
		in:menuIn
		out:menuOut
		oncontextmenu={(event) => event.preventDefault()}
		onkeydown={onMenuKeydown}
		style:left={`${placement.left}px`}
		style:top={`${placement.top}px`}
		style:width={`${placement.width}px`}
		style:max-height={`${placement.maxHeight}px`}
		style:transform-origin={placement.transformOrigin}
		class="border-border bg-card text-card-foreground fixed z-[60] overflow-y-auto overscroll-contain rounded-[14px] border p-[5px] shadow-[0_1px_2px_rgba(28,25,23,0.06),0_16px_36px_-18px_rgba(28,25,23,0.5)] outline-none"
	>
		{#each items as item, index (item.id)}
			{#if item.type === 'separator'}
				<div class="px-1 py-1">
					<hr class="bg-border h-px border-0" />
				</div>
			{:else}
				<button
					bind:this={itemEls[index]}
					type="button"
					role="menuitem"
					tabindex="-1"
					aria-disabled={item.disabled || undefined}
					onpointermove={() => onItemPointerMove(index)}
					onpointerdown={() => (pressed = index)}
					onclick={(event) => onItemClick(event, index)}
					class={cn(
						'flex h-[32px] w-full cursor-default items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] outline-none select-none',
						item.disabled ? 'text-muted-foreground/70' : 'text-foreground',
						active === index && 'bg-muted'
					)}
				>
					{#if hasIcons}
						<span
							aria-hidden="true"
							class="text-muted-foreground grid size-4 shrink-0 place-items-center"
						>
							{@render item.icon?.()}
						</span>
					{/if}

					<span
						class="min-w-0 flex-1 truncate"
						{@attach motionTo(() => ({
							keyframes: { x: active === index ? 3 : 0 },
							transition: { duration: 0.16, ease: EASE }
						}))}
					>
						{item.label}
					</span>

					{#if item.shortcut}
						<span
							aria-hidden="true"
							class="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums"
						>
							{item.shortcut}
						</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}
