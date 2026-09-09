<script lang="ts">
	/**
	 * What a clicked pin says: the record's name, as a link when the reader may
	 * open it. Mounted into the MapLibre popup by `MapView.Root` — a Svelte
	 * component, never `setHTML()`, because the label is user data.
	 */
	let { label, href }: { label: string; href: string | null } = $props();
</script>

<div data-slot="map-view-popup" class="text-foreground px-1 py-0.5 text-sm font-medium">
	{#if href}
		<a {href} class="underline-offset-4 hover:underline">{label}</a>
	{:else}
		{label}
	{/if}
</div>
