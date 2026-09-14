<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * One open thing. It is a link, because each tab here is somewhere you can
	 * go — which means middle-click, ⌘-click and the browser's own history all
	 * work, and `aria-current` says which one you are on without an ARIA
	 * tablist that would promise panels this strip does not own.
	 *
	 * Fixed width on purpose: every close button then sits in the same place,
	 * so a run of tabs can be closed without chasing the next × across the bar.
	 */
	let {
		ref = $bindable(null),
		class: className,
		active = false,
		label,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> & {
		/** True for the tab the reader is on. */
		active?: boolean;
		/** The tab's text. Also its title, since a long one truncates. */
		label: string;
		/** The close control, when this tab can be closed. */
		children?: Snippet;
	} = $props();
</script>

<div
	data-slot="tab-strip-tab"
	data-active={active ? '' : undefined}
	class={cn(
		'group/tab flex h-7 w-36 shrink-0 items-center gap-0.5 rounded-md pr-0.5 pl-2.5 text-xs font-medium transition-colors',
		active
			? 'bg-accent text-accent-foreground'
			: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
		className
	)}
>
	<a
		bind:this={ref}
		class="min-w-0 flex-1 truncate text-left outline-none focus-visible:underline"
		title={label}
		aria-current={active ? 'page' : undefined}
		{...restProps}
	>
		{label}
	</a>
	{@render children?.()}
</div>
