<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/app-header.svelte';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import AssistantContext from '$lib/components/assistant-context.svelte';
	import AssistantSidebar from '$lib/components/assistant-sidebar.svelte';
	import NoteDock from '$lib/components/note-dock.svelte';
	import SearchDialog from '$lib/components/search-dialog.svelte';
	import SettingsSidebar from '$lib/components/settings-sidebar.svelte';
	import UpgradePrompt from '$lib/components/upgrade-prompt.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { titleFor } from '$lib/features/pages';

	let { data, children } = $props();

	// The one <title> for everything in the shell, resolved from the `pages`
	// table on every navigation — no page file sets its own. The breadcrumb
	// trail in the header names pages with the same `titleFor()`.
	let title = $derived(titleFor(page.data, page.url.pathname));

	// Settings is its own shell: under /settings the sidebar becomes the
	// settings sections (`settingsNav` in $lib/navigation) instead of the app
	// nav, which is why Settings is not an app nav entry at all — you get
	// there from the user menu in the sidebar footer.
	let inSettings = $derived(
		page.url.pathname === '/settings' || page.url.pathname.startsWith('/settings/')
	);

	// The assistant is a shell of its own for the same reason: while you are in
	// a conversation the thing to navigate is your threads, not the app nav —
	// Home is how you leave, exactly as "Back to app" is in settings. It is
	// also the first shell to dock a rail on the other side of the body.
	let inAssistant = $derived(
		page.url.pathname === '/assistant' || page.url.pathname.startsWith('/assistant/')
	);
</script>

<svelte:head>
	<!-- +error.svelte renders its own title; two <title> tags in the head and
	     the first one wins, so stand down while an error is showing. -->
	{#if title && !page.error}<title>{title}</title>{/if}
</svelte:head>

<!-- The wrapper is the ground the content panel sits on, so it wears the
     sidebar's colour: what shows through the gap around the panel. -->
<Sidebar.Provider class="bg-sidebar" open={data.sidebarOpen}>
	{#if inSettings}
		<SettingsSidebar />
	{:else if inAssistant}
		<AssistantSidebar />
	{:else}
		<AppSidebar />
	{/if}
	<!--
		The content panel: inset by `--shell-gap` on every side and rounded, so the
		sidebar's ground shows around it. `overflow-clip` — not `hidden` — is what
		rounds the corners: it clips to the rounded box without becoming a scroll
		container, so the header inside keeps sticking to the viewport and the page
		keeps scrolling at the document level (which is what `fitPageSize()` and the
		scroll spy measure against).
	-->
	<Sidebar.Inset class="border-border m-(--shell-gap) overflow-clip rounded-xl border shadow-sm">
		<AppHeader />
		<div class="app-content">
			{@render children()}
		</div>
	</Sidebar.Inset>
	<!--
		The context rail: a panel of its own to the end side of the body, on the
		shell's ground like the sidebar and standing the same height as the
		content panel — not a card inside the page, which would sit inside the
		panel's padding and scroll with it.
	-->
	{#if inAssistant}
		<AssistantContext />
	{/if}
	<!-- The one ⌘K palette; the sidebar's search button opens it with `showSearch()`. -->
	<SearchDialog />
	<!-- The note dock, docked to the edge of every screen in the shell. It
	     renders nothing at all when this session has no notes feature. -->
	<NoteDock />
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
