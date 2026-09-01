<script lang="ts">
	import { page } from '$app/state';
	import { UntitledButton } from '$lib/components/enhanced/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let title = $derived(page.status === 404 ? 'Page not found' : 'Something went wrong');
	let description = $derived(
		page.status === 404
			? "The page you're looking for doesn't exist or has moved."
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<svelte:head>
	<title>{page.status} — {title}</title>
</svelte:head>

<div class="bg-muted/40 flex min-h-svh items-center justify-center p-4">
	<Card.Root class="w-full max-w-md text-center">
		<Card.Header>
			<p class="text-muted-foreground text-sm font-medium">{page.status}</p>
			<Card.Title class="text-2xl">{title}</Card.Title>
			<Card.Description>{description}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col items-center gap-3">
			<UntitledButton href="/">Back to the app</UntitledButton>
			{#if page.error?.code}
				<!-- Opaque reference from handleError — safe to show, useful in logs. -->
				<p class="text-muted-foreground font-mono text-xs">ref: {page.error.code}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
