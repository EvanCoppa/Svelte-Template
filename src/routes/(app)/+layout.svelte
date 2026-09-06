<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/app-header.svelte';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import UpgradePrompt from '$lib/components/upgrade-prompt.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { titleFor } from '$lib/features/pages';

	let { data, children } = $props();

	// The one <title> for everything in the shell, resolved from the `pages`
	// table on every navigation — no page file sets its own. The breadcrumb
	// trail in the header names pages with the same `titleFor()`.
	let title = $derived(titleFor(page.data, page.url.pathname));
</script>

<svelte:head>
	<!-- +error.svelte renders its own title; two <title> tags in the head and
	     the first one wins, so stand down while an error is showing. -->
	{#if title && !page.error}<title>{title}</title>{/if}
</svelte:head>

<Sidebar.Provider open={data.sidebarOpen}>
	<AppSidebar />
	<Sidebar.Inset>
		<AppHeader />
		<div class="app-content">
			{@render children()}
		</div>
	</Sidebar.Inset>
	<!-- The one upgrade dialog; `showUpgrade()` from `$lib/upgrade.svelte` opens it anywhere in the shell. -->
	<UpgradePrompt plans={data.plans} currentTier={data.activeOrg.tierName} />
</Sidebar.Provider>

<style>
	.app-content {
		padding: 24px var(--site-padding) 48px;
	}

	@media (max-width: 768px) {
		.app-content {
			padding: 12px 12px 48px;
		}
	}
</style>
