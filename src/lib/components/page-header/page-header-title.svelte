<script lang="ts">
	import { page } from '$app/state';
	import { titleFor } from '$lib/features/pages';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();

	// With no children the heading says what the `pages` row titles the
	// document with — the same `titleFor()` the shell and the breadcrumb trail
	// use, so a page is named once and follows its industry's word for it.
	// Children are for a heading that is deliberately not the page's name.
	let title = $derived(titleFor(page.data, page.url.pathname));
</script>

<!-- The one `<h1>` on the page. -->
<h1
	bind:this={ref}
	data-slot="page-header-title"
	class={cn('text-2xl font-bold tracking-tight', className)}
	{...restProps}
>
	{#if children}{@render children()}{:else}{title}{/if}
</h1>
