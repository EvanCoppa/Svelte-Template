<script lang="ts">
	// Renders inside the sidebar/header shell, so an error on one page doesn't
	// dump the user out of the app chrome.
	import { page } from '$app/state';
	import { UntitledButton } from '$lib/components/enhanced/index.js';

	let title = $derived(page.status === 404 ? 'Page not found' : 'Something went wrong');
	let description = $derived(
		page.status === 404
			? "This page doesn't exist or has moved."
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<svelte:head>
	<title>{page.status} — {title}</title>
</svelte:head>

<div class="mx-auto flex max-w-xl flex-col items-center gap-4 py-24 text-center">
	<p class="text-muted-foreground text-sm font-medium">{page.status}</p>
	<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
	<p class="text-muted-foreground">{description}</p>
	<UntitledButton href="/" color="secondary">Back to the dashboard</UntitledButton>
	{#if page.error?.code}
		<p class="text-muted-foreground font-mono text-xs">ref: {page.error.code}</p>
	{/if}
</div>
