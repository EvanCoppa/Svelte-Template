<script lang="ts">
	import type { Snippet } from 'svelte';
	import { animate } from 'motion';
	import { cn } from '$lib/utils.js';
	import { motionTo } from '$lib/motion.js';

	export interface AccordionItem {
		/** Stable id — it keys the open set and the aria wiring. */
		id: string;
		title: string;
		/** Plain text body. For rich panels pass the accordion's `panel` snippet instead. */
		content?: string;
		/** Optional trailing note on the header, e.g. a count. */
		meta?: string;
	}

	interface AccordionRowProps {
		item: AccordionItem;
		open: boolean;
		headerId: string;
		panelId: string;
		headingLevel: number;
		maxPanelHeight: number;
		reduced: boolean;
		ontoggle: () => void;
		onheaderkeydown: (event: KeyboardEvent) => void;
		panel?: Snippet<[AccordionItem]>;
		/** The header button, handed back so the accordion can move focus between rows. */
		el?: HTMLButtonElement;
	}

	/** Framer's `{ stiffness: 480, damping: 40, mass: 0.6 }` from the original. */
	const DISCLOSE = { type: 'spring', stiffness: 480, damping: 40, mass: 0.6 } as const;
	/** The chevron flipping over. */
	const CHEVRON = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
	const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
	const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];

	let {
		item,
		open,
		headerId,
		panelId,
		headingLevel,
		maxPanelHeight,
		reduced,
		ontoggle,
		onheaderkeydown,
		panel,
		el = $bindable()
	}: AccordionRowProps = $props();

	let wrapperEl: HTMLDivElement | undefined = $state();
	let height = $state(0);
	let ready = $state(false);

	/** Only used before the first measurement lands, so open rows never flash shut. */
	const preHeight = $derived(ready ? null : open ? 'auto' : '0px');

	function measure(node: HTMLElement) {
		const read = () => {
			const next = node.getBoundingClientRect().height;
			if (Math.abs(height - next) >= 0.5) height = next;
		};

		read();
		ready = true;

		const observer = new ResizeObserver(read);
		observer.observe(node);
		return () => observer.disconnect();
	}

	let placed = false;
	$effect(() => {
		const node = wrapperEl;
		const target = open ? height : 0;
		if (!node || !ready) return;

		const still = !placed || reduced;
		placed = true;

		const controls = animate(node, { height: `${target}px` }, still ? { duration: 0 } : DISCLOSE);
		return () => controls.stop();
	});
</script>

<div data-slot="accordion-row" data-state={open ? 'open' : 'closed'}>
	<div role="heading" aria-level={headingLevel}>
		<button
			bind:this={el}
			id={headerId}
			type="button"
			aria-expanded={open}
			aria-controls={panelId}
			data-accordion-header=""
			onclick={ontoggle}
			onkeydown={onheaderkeydown}
			class="hover:bg-muted focus-visible:bg-primary/5 flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-ring)]"
		>
			<span
				class={cn(
					'min-w-0 flex-1 truncate text-[13px] font-medium transition-colors duration-150',
					open ? 'text-foreground' : 'text-foreground/80'
				)}
			>
				{item.title}
			</span>

			{#if item.meta}
				<span class="text-muted-foreground shrink-0 text-[11.5px] tabular-nums">{item.meta}</span>
			{/if}

			<svg
				width="13"
				height="13"
				viewBox="0 0 256 256"
				fill="none"
				aria-hidden="true"
				class="text-muted-foreground shrink-0"
				{@attach motionTo(() => ({ keyframes: { rotate: open ? 180 : 0 }, transition: CHEVRON }))}
			>
				<path
					d="M208 96l-80 80-80-80"
					stroke="currentColor"
					stroke-width="16"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>

	<div bind:this={wrapperEl} class="overflow-hidden" style:height={preHeight}>
		<div
			id={panelId}
			role="region"
			aria-labelledby={headerId}
			aria-hidden={open ? undefined : 'true'}
			inert={!open}
			class="border-border bg-muted/50 overflow-y-auto overscroll-contain border-t shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] [scrollbar-gutter:stable]"
			style:max-height={`${maxPanelHeight}px`}
			{@attach measure}
		>
			<div
				class="text-muted-foreground px-3.5 pt-3 pb-3.5 text-[12.5px] leading-relaxed"
				{@attach motionTo(() => ({
					keyframes: { opacity: open ? 1 : 0 },
					// Opening fades in slowly enough to read; closing gets out of the way.
					transition: open ? { duration: 0.18, ease: EASE } : { duration: 0.14, ease: EXIT_EASE }
				}))}
			>
				{#if panel}
					{@render panel(item)}
				{:else}
					{item.content ?? ''}
				{/if}
			</div>
		</div>
	</div>
</div>
