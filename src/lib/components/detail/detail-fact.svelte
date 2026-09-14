<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	let {
		icon: Icon,
		children
	}: {
		/** The lucide icon that says which door this fact leads through. */
		icon: Component<{ class?: string }>;
		children: Snippet;
	} = $props();
</script>

<li data-slot="detail-fact" class="flex min-w-0 items-center gap-1.5">
	<Icon class="size-4 shrink-0" />
	<span class="truncate">{@render children()}</span>
</li>
