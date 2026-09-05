<script lang="ts">
	import AppHeader from '$lib/components/app-header.svelte';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import UpgradePrompt from '$lib/components/upgrade-prompt.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let { data, children } = $props();
</script>

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
