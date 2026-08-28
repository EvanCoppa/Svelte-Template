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
		data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
	>
		<!-- This is what handles the sidebar gap on desktop -->
		<div
			data-slot="sidebar-gap"
			class={cn(
				'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
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
				'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-out md:flex',
				'group-data-[peek=true]:z-[55] group-data-[peek=true]:p-2',
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
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class="bg-sidebar group-data-[variant=floating]:border-sidebar-border group-data-[peek=true]:border-sidebar-border flex h-full w-full flex-col group-data-[peek=true]:overflow-hidden group-data-[peek=true]:rounded-xl group-data-[peek=true]:border group-data-[peek=true]:shadow-2xl group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
