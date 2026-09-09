<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { SIDEBAR_WIDTH_MOBILE } from './constants.js';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		side = 'left',
		variant = 'sidebar',
		collapsible = 'offcanvas',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		side?: 'left' | 'right';
		variant?: 'sidebar' | 'floating' | 'inset';
		collapsible?: 'offcanvas' | 'icon' | 'none';
	} = $props();

	const sidebar = useSidebar();

	// Hover-peek: while collapsed offcanvas on desktop, moving the cursor within
	// PEEK_TRIGGER_PX of the screen edge slides the sidebar out as an overlay; it
	// slides back once the cursor leaves the sidebar's footprint.
	const PEEK_TRIGGER_PX = 15;
	let containerRef = $state<HTMLDivElement | null>(null);
	let hoverPeek = $state(false);
	const canPeek = $derived(
		collapsible === 'offcanvas' && !sidebar.isMobile && sidebar.state === 'collapsed'
	);

	// A popover triggered from inside the sidebar (team switcher, user menu, ...)
	// portals its content outside the sidebar's DOM, so the pointer can be past
	// the sidebar's edge while it's open. Keep the sidebar peeked in that case
	// instead of letting the mousemove tracking below slide it shut.
	const effectivePeek = $derived(canPeek && (hoverPeek || sidebar.hasOpenPopover));

	$effect(() => {
		sidebar.peek = effectivePeek;
		return () => {
			sidebar.peek = false;
		};
	});

	// Resolves once every animation running on the elements has finished — at
	// once when nothing is, as under reduced motion. Returns a cancel for when
	// the wait has gone stale.
	function whenSettled(elements: (HTMLElement | null)[], then: () => void) {
		let current = true;
		const animations = elements.flatMap((el) => el?.getAnimations() ?? []);
		Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
			if (current) then();
		});
		return () => {
			current = false;
		};
	}

	// Docking: opening out of a peek, in two beats. The context raises
	// `sidebar.docking` at the open. First the content moves aside — the gap's
	// width transition — while the panel keeps its floating look on top of it;
	// `pushed` marks that beat done, and the look then eases out to the edges,
	// which is the second. The dock ends when that has settled. Closing again
	// mid-dock ends it too — during the first beat the panel is still afloat,
	// so it leaves the way a peek does.
	let gapRef = $state<HTMLDivElement | null>(null);
	let innerRef = $state<HTMLDivElement | null>(null);
	let pushed = $state(false);
	let leaving = $state(false);
	$effect(() => {
		if (!sidebar.docking) return;
		if (sidebar.state !== 'expanded') {
			sidebar.docking = false;
			leaving = !pushed;
			pushed = false;
			return;
		}
		return whenSettled(pushed ? [containerRef, innerRef] : [gapRef], () => {
			if (pushed) sidebar.docking = false;
			pushed = !pushed;
		});
	});

	// Leaving: a peek that ends slides the panel away. It keeps its floating
	// look, and its place above the header, until it is off-screen — otherwise
	// it would square off and slip under the header on the way out. Raised
	// before the DOM updates, so the look never drops for a frame in between;
	// a cursor back at the edge in time simply peeks it out again.
	let wasPeeked = false;
	$effect.pre(() => {
		const peeked = effectivePeek;
		if (wasPeeked && !peeked && sidebar.state === 'collapsed') leaving = true;
		wasPeeked = peeked;
	});
	$effect(() => {
		if (!leaving) return;
		if (effectivePeek || sidebar.state !== 'collapsed') {
			leaving = false;
			return;
		}
		return whenSettled([containerRef], () => (leaving = false));
	});

	// The chrome the panel wears while it sits over the content rather than
	// beside it: padding, rounded edge, shadow. Peeked, docking until the
	// content has moved, or leaving. (Not `variant="floating"`, which is the
	// permanent version of the same look.)
	const floating = $derived(effectivePeek || (sidebar.docking && !pushed) || leaving);

	$effect(() => {
		if (!canPeek) {
			hoverPeek = false;
			return;
		}

		function handleMouseMove(e: MouseEvent) {
			const width = containerRef?.getBoundingClientRect().width ?? 0;
			if (side === 'left') {
				if (hoverPeek) {
					if (e.clientX > width) hoverPeek = false;
				} else if (e.clientX <= PEEK_TRIGGER_PX) {
					hoverPeek = true;
				}
			} else {
				const innerWidth = window.innerWidth;
				if (hoverPeek) {
					if (e.clientX < innerWidth - width) hoverPeek = false;
				} else if (e.clientX >= innerWidth - PEEK_TRIGGER_PX) {
					hoverPeek = true;
				}
			}
		}

		function handleMouseOut(e: MouseEvent) {
			// Cursor left the window entirely.
			if (!e.relatedTarget) hoverPeek = false;
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseout', handleMouseOut);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseout', handleMouseOut);
		};
	});
</script>

{#if collapsible === 'none'}
	<div
		class={cn(
			'bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col',
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
{:else if sidebar.isMobile}
	<Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)} {...restProps}>
		<Sheet.Content
			data-sidebar="sidebar"
			data-slot="sidebar"
			data-mobile="true"
			class="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
			style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
			{side}
		>
			<Sheet.Header class="sr-only">
				<Sheet.Title>Sidebar</Sheet.Title>
				<Sheet.Description>Displays the mobile sidebar.</Sheet.Description>
			</Sheet.Header>
			<div class="flex h-full w-full flex-col">
				{@render children?.()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<div
		bind:this={ref}
		class="text-sidebar-foreground group peer hidden md:block"
		data-state={sidebar.state}
		data-peek={effectivePeek}
		data-floating={floating}
		data-docking={sidebar.docking}
		data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
	>
		<!-- This is what handles the sidebar gap on desktop -->
		<div
			bind:this={gapRef}
			data-slot="sidebar-gap"
			class={cn(
				'relative w-(--sidebar-width) bg-transparent transition-[width] duration-100 ease-out',
				'group-data-[collapsible=offcanvas]:w-0',
				'group-data-[side=right]:rotate-180',
				variant === 'floating' || variant === 'inset'
					? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
			)}
		></div>
		<div
			bind:this={containerRef}
			data-slot="sidebar-container"
			class={cn(
				'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-100 ease-out md:flex',
				// Over the content, the panel also sits above the header — for the
				// whole of a dock, so the header never paints over it mid-settle.
				'group-data-[docking=true]:z-[55] group-data-[floating=true]:z-[55] group-data-[floating=true]:p-2',
				// The dock's second beat: the padding eases out to the edges. Only
				// once expanded — a peek that slides away is gone too soon to fade.
				'group-data-[state=expanded]:transition-[left,right,width,padding]',
				side === 'left'
					? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] group-data-[peek=true]:left-0!'
					: 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] group-data-[peek=true]:right-0!',
				// Adjust the padding for floating and inset variants.
				variant === 'floating' || variant === 'inset'
					? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
				className
			)}
			{...restProps}
		>
			<div
				bind:this={innerRef}
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class={cn(
					'bg-sidebar flex h-full w-full flex-col',
					// The floating edge is a ring, not a border: a border is whole
					// pixels wide, so it can only vanish, while a ring is part of the
					// shadow and fades with it.
					'group-data-[floating=true]:ring-sidebar-border group-data-[floating=true]:overflow-hidden group-data-[floating=true]:rounded-xl group-data-[floating=true]:shadow-2xl group-data-[floating=true]:ring-1',
					// Docking, second beat, with the container's padding above:
					// the corners, the edge and the shadow ease away together.
					'group-data-[state=expanded]:transition-[border-radius,box-shadow] group-data-[state=expanded]:duration-100 group-data-[state=expanded]:ease-out',
					'group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm'
				)}
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
