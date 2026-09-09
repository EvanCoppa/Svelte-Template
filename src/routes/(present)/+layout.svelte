<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<!-- The one <title> for the group, like (app)'s: every page here is named
	     after the record it shows, so its load returns `title`. -->
	{#if page.data.title && !page.error}<title>{page.data.title}</title>{/if}
</svelte:head>

{@render children()}
