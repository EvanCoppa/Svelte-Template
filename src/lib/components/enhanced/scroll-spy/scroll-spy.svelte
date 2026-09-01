<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { motionTo, reducedMotion } from '$lib/motion.js';

	/** The marker travelling to the section now in view. */
	const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

	export type ScrollSpySection = {
		id: string;
		label: string;
	};

	export interface ScrollSpyProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
		/** Ordered list of { id, label }. Each id is resolved from the document, so the content needs no wiring beyond the id it already has. */
		sections: readonly ScrollSpySection[];
		/** Distance in px from the top of the scroll root to the reading line. Set it to the height of whatever sticky header covers the content. */
		offset?: number;
		/** A scroll container to watch. Omitted, the window is the scroller. */
		root?: HTMLElement | null;
		/** Fires once per section change, never per frame. */
		onChange?: (id: string) => void;
		/** Accessible name for the nav landmark. */
		label?: string;
	}

	/** Delay before the settled section is announced, so a scroll is not narrated heading by heading. */
	const SETTLE = 420;
	/** How long a clicked destination stays locked in while the smooth scroll runs. */
	const RELEASE = 900;

	let {
		class: className,
		sections,
		offset = 96,
		root = null,
		onChange,
		label = 'On this page',
		...restProps
	}: ScrollSpyProps = $props();

	let activeId = $state<string | null>(null);
	let announce = $state('');
	let thumb = $state({ left: 0, width: 0, ready: false });

	const active = $derived(
		(activeId && sections.some((s) => s.id === activeId) ? activeId : sections[0]?.id) ?? ''
	);

	const chips = new SvelteMap<string, HTMLElement>();

	let frame = 0;
	let lock: string | null = null;
	let lockTimer: ReturnType<typeof setTimeout> | undefined;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let started = false;

	onDestroy(() => {
		if (lockTimer) clearTimeout(lockTimer);
		if (settleTimer) clearTimeout(settleTimer);
	});

	// The reading line is not pinned: it starts under the top edge and slides to
	// the bottom as the scroll runs out, so short tail sections still get a turn.
	function measure(): string {
		const items = sections;
		if (items.length === 0) return '';

		const container = root;
		const viewport = container ? container.clientHeight : window.innerHeight;
		const top = container ? container.scrollTop : window.scrollY;
		const max = container
			? container.scrollHeight - container.clientHeight
			: document.documentElement.scrollHeight - window.innerHeight;
		const ratio = max > 0 ? Math.min(1, Math.max(0, top / max)) : 1;

		const line =
			(container ? container.getBoundingClientRect().top : 0) +
			offset +
			ratio * Math.max(0, viewport - offset - 1);

		let current = '';
		let last = '';

		for (const item of items) {
			const node = document.getElementById(item.id);
			if (!node) continue;
			last = item.id;
			if (!current) current = item.id;
			if (node.getBoundingClientRect().top <= line + 1) current = item.id;
		}

		const atEnd = container
			? container.scrollTop + container.clientHeight >= container.scrollHeight - 2
			: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

		return atEnd && last ? last : current;
	}

	function release() {
		lock = null;
		if (lockTimer) {
			clearTimeout(lockTimer);
			lockTimer = undefined;
		}
	}

	function commit(next: string) {
		if (!next || next === active) return;
		activeId = next;
		onChange?.(next);

		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			settleTimer = undefined;
			announce = sections.find((s) => s.id === next)?.label ?? '';
		}, SETTLE);
	}

	function sync() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			const next = measure();
			if (!next) return;
			// A click locks the destination in; a wheel or touch abandons the lock.
			if (lock) {
				if (lock === next) release();
				return;
			}
			commit(next);
		});
	}

	function scrollTo(id: string) {
		const node = document.getElementById(id);
		if (!node) return;

		lock = id;
		commit(id);

		const container = root;
		const behavior: ScrollBehavior = reducedMotion.current ? 'auto' : 'smooth';
		const rect = node.getBoundingClientRect();

		const viewport = container ? container.clientHeight : window.innerHeight;
		const max = container
			? Math.max(0, container.scrollHeight - container.clientHeight)
			: Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
		const distance = container
			? rect.top - container.getBoundingClientRect().top + container.scrollTop
			: rect.top + window.scrollY;
		const usable = Math.max(0, viewport - offset - 1);
		const top = max > 0 ? Math.min(max, Math.max(0, (distance - offset) / (1 + usable / max))) : 0;

		if (container) container.scrollTo({ top, behavior });
		else window.scrollTo({ top, behavior });

		// The keyboard lands where the eye does.
		if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
		node.focus({ preventScroll: true });

		if (lockTimer) clearTimeout(lockTimer);
		lockTimer = setTimeout(() => {
			lock = null;
			lockTimer = undefined;
			sync();
		}, RELEASE);
	}

	function handleClick(event: MouseEvent, id: string) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		scrollTo(id);
	}

	function abandon() {
		if (lock) release();
	}

	let lastLeft = -1;
	let lastWidth = -1;

	function syncThumb() {
		const el = chips.get(active);
		if (!el) return;
		const left = el.offsetLeft;
		const width = el.offsetWidth;
		if (left === lastLeft && width === lastWidth) return;
		lastLeft = left;
		lastWidth = width;
		thumb = { left, width, ready: true };
	}

	const chip: (id: string) => Attachment<HTMLElement> = (id) => (el) => {
		chips.set(id, el);
		untrack(syncThumb);
		return () => {
			chips.delete(id);
		};
	};

	const strip: Attachment<HTMLElement> = (el) => {
		const observer = new ResizeObserver(() => syncThumb());
		observer.observe(el);
		return () => observer.disconnect();
	};

	// Positions are read from live rects, so late images or an opening accordion
	// cannot leave the rail pointing at the wrong heading.
	$effect(() => {
		const container = root;
		// Re-bind when the section list, the reading line or the scroll root changes.
		const key = sections.map((s) => s.id).join('|');
		void offset;

		const scroller: EventTarget = container ?? window;
		scroller.addEventListener('scroll', sync, { passive: true });
		window.addEventListener('resize', sync);
		window.addEventListener('wheel', abandon, { passive: true });
		window.addEventListener('touchstart', abandon, { passive: true });

		const observer = new ResizeObserver(sync);
		observer.observe(container ?? document.documentElement);
		for (const id of key ? key.split('|') : []) {
			const node = document.getElementById(id);
			if (node) observer.observe(node);
		}

		sync();

		untrack(() => {
			if (started) return;
			started = true;
			if (active) onChange?.(active);
		});

		return () => {
			scroller.removeEventListener('scroll', sync);
			window.removeEventListener('resize', sync);
			window.removeEventListener('wheel', abandon);
			window.removeEventListener('touchstart', abandon);
			observer.disconnect();
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		};
	});

	// The thumb follows the active chip, and the active chip keeps itself in view.
	$effect(() => {
		syncThumb();
		chips.get(active)?.scrollIntoView({
			behavior: reducedMotion.current ? 'auto' : 'smooth',
			block: 'nearest',
			inline: 'nearest'
		});
	});
</script>

<nav {...restProps} aria-label={label} class={cn('w-full', className)}>
	<div
		class="bg-muted rounded-[10px] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
	>
		<ol
			{@attach strip}
			class="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{#if thumb.ready}
				<span
					aria-hidden="true"
					class="bg-foreground absolute top-0 left-0 h-full rounded-[6px]"
					{@attach motionTo(() => ({
						keyframes: { x: thumb.left, width: thumb.width },
						transition: CELL
					}))}
				></span>
			{/if}

			{#each sections as section (section.id)}
				<li {@attach chip(section.id)} class="relative flex-[1_0_auto]">
					<a
						href="#{section.id}"
						aria-current={section.id === active ? 'location' : undefined}
						onclick={(event) => handleClick(event, section.id)}
						class="group focus-visible:after:bg-primary/5 relative flex h-7 w-full items-center justify-center rounded-[6px] px-2.5 text-[12.5px] outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:shadow-[inset_0_0_0_1px_var(--ring)]"
					>
						<span class="relative grid">
							<!-- An invisible medium twin fixes the chip width, so the weight
							     arriving with the thumb cannot reflow the row. -->
							<span
								aria-hidden="true"
								class="invisible col-start-1 row-start-1 font-medium whitespace-nowrap"
							>
								{section.label}
							</span>
							<span
								class={cn(
									'col-start-1 row-start-1 whitespace-nowrap transition-colors duration-150',
									section.id === active
										? 'text-background font-medium'
										: 'text-muted-foreground group-hover:text-foreground'
								)}
							>
								{section.label}
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</div>

	<p aria-live="polite" class="sr-only">{announce}</p>
</nav>
