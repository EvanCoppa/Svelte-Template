<script lang="ts">
	import {
		compactTime,
		eventAccent,
		eventStart,
		eventSurface,
		formatTimeRange
	} from '$lib/calendar';
	import type { CalendarEvent } from '$lib/server/crm/calendar';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * One event, drawn the way the surface it sits on wants:
	 *
	 *   chip   a month cell's one-liner — a coloured dot, the time, the title
	 *   bar    an all-day or multi-day run across a row of days, open-ended
	 *          where it continues past the row
	 *   block  a timed block in the hours, tall as it is long, with a handle
	 *          along its bottom edge to stretch it
	 *
	 * It is a `role="button"` rather than a `<button>` because a block holds
	 * the resize handle, and a button may not contain another control. Every
	 * pointer handler, the position and the attachments arrive from the view
	 * that placed it; this file only knows how an event looks.
	 */
	let {
		ref = $bindable(null),
		class: className,
		event,
		variant,
		selected = false,
		lifted = false,
		resizable = false,
		continuesBefore = false,
		continuesAfter = false,
		/** The block's height in pixels, so a short one drops its second line. */
		height,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		event: CalendarEvent;
		variant: 'chip' | 'bar' | 'block';
		/** The details popover is open on it. */
		selected?: boolean;
		/** Being dragged: raised, and out of the flow of hover states. */
		lifted?: boolean;
		/** Draws the stretch handle; blocks only, and only for a writer. */
		resizable?: boolean;
		continuesBefore?: boolean;
		continuesAfter?: boolean;
		height?: number;
	} = $props();

	const surface = $derived(eventSurface(event.color));
	const accent = $derived(eventAccent(event.color));
	const time = $derived(
		variant === 'block' ? formatTimeRange(event) : compactTime(eventStart(event))
	);
	const compact = $derived(height !== undefined && height < 40);
	const label = $derived(
		event.all_day ? event.title : `${event.title}, ${formatTimeRange(event)}`.replace(' – ', ' to ')
	);
</script>

<div
	bind:this={ref}
	data-slot="calendar-event"
	data-event={event.id}
	role="button"
	tabindex="0"
	aria-label={label}
	aria-pressed={selected}
	class={cn(
		'group/event relative cursor-pointer touch-none text-xs leading-none font-medium outline-none select-none',
		'focus-visible:ring-ring/50 transition-[box-shadow,transform,opacity] duration-150 ease-out focus-visible:ring-[3px] motion-reduce:transition-none',
		variant === 'chip' && [
			'hover:bg-accent flex h-[22px] items-center gap-1.5 rounded-md px-1.5',
			selected && 'bg-accent ring-ring/40 ring-2'
		],
		variant === 'bar' && [
			'flex h-[22px] items-center gap-1.5 border px-2 shadow-xs',
			surface,
			continuesBefore ? 'rounded-l-none border-l-0' : 'rounded-l-md',
			continuesAfter ? 'rounded-r-none border-r-0' : 'rounded-r-md',
			selected && 'ring-ring/40 ring-2'
		],
		variant === 'block' && [
			'absolute flex flex-col gap-1 overflow-hidden rounded-lg border py-1.5 ps-2.5 pe-2 shadow-xs',
			'transition-[top,left,width,height,box-shadow,transform,opacity] duration-150 ease-out motion-reduce:transition-none',
			surface,
			selected && 'ring-ring/40 z-20 ring-2'
		],
		lifted && 'z-30 scale-[1.02] shadow-lg',
		className
	)}
	{...restProps}
>
	{#if variant === 'chip'}
		<span class={cn('size-2 shrink-0 rounded-full', accent)}></span>
		{#if !event.all_day}
			<span class="text-muted-foreground shrink-0 tabular-nums">{time}</span>
		{/if}
		<span class="truncate">{event.title}</span>
	{:else if variant === 'bar'}
		{#if !continuesBefore}
			<span class={cn('size-1.5 shrink-0 rounded-full', accent)}></span>
		{/if}
		<span class="truncate">{event.title}</span>
	{:else}
		<span class={cn('absolute inset-y-0 start-0 w-[3px]', accent)}></span>
		<span class={cn('truncate', compact ? 'leading-[1.1]' : 'font-semibold')}>
			{event.title}{#if compact}<span class="ms-1.5 font-normal tabular-nums opacity-70"
					>{compactTime(eventStart(event))}</span
				>{/if}
		</span>
		{#if !compact}
			<span class="truncate tabular-nums opacity-75">{time}</span>
		{/if}
		{#if resizable}
			<span
				data-resize
				aria-hidden="true"
				class="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center opacity-0 transition-opacity group-hover/event:opacity-100"
			>
				<span class="mb-0.5 h-0.5 w-6 rounded-full bg-current opacity-40"></span>
			</span>
		{/if}
	{/if}
</div>
