<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> = $props();

	const sidebar = useSidebar();

	let isDragging = $state(false);
	let startX = $state(0);

	function handleMouseDown(e: MouseEvent) {
		isDragging = false;
		startX = e.clientX;
	}

	function handleMouseMove(e: MouseEvent) {
		if (e.buttons === 1) {
			const moved = Math.abs(e.clientX - startX);
			if (moved > 5) {
				isDragging = true;
			}
		}
	}

	function handleMouseUp() {
		if (isDragging) {
			sidebar.setOpen(false);
		} else {
			sidebar.toggle();
		}
		isDragging = false;
	}
</script>

<button
	bind:this={ref}
	data-sidebar="rail"
	data-slot="sidebar-rail"
	aria-label="Toggle Sidebar"
	tabIndex={-1}
	onmousedown={handleMouseDown}
	onmousemove={handleMouseMove}
	onmouseup={handleMouseUp}
	title="Toggle Sidebar"
	class={cn(
		'hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-[calc(1/2*100%-1px)] after:w-[2px] sm:flex',
		'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
		'[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
		'hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
		'[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
		'[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
