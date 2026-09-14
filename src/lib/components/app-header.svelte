<script lang="ts">
	import { page } from '$app/state';
	import AssistantTabs from '$lib/components/assistant-tabs.svelte';
	import Breadcrumbs from '$lib/components/breadcrumbs.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { theme } from '$lib/theme.svelte';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';

	const sidebar = useSidebar();

	// The toggle lives in the sidebar header: on desktop a collapsed sidebar
	// peeks out when the cursor reaches the screen edge, so the button is
	// always reachable and a second one here would only double it. Mobile is
	// the exception — the sidebar is a sheet there, with nothing to hover, so
	// the header keeps the one way in while the sheet is closed.
	const needsTrigger = $derived(sidebar.isMobile && !sidebar.openMobile);

	// A screen whose open documents are a strip of tabs puts them here, in the
	// one header, rather than growing a bar of its own inside the page — the
	// same branch the (app) layout makes to swap the sidebar for that shell.
	const inAssistant = $derived(
		page.url.pathname === '/assistant' || page.url.pathname.startsWith('/assistant/')
	);
</script>

<header class="header">
	<div class="header-inner">
		{#if needsTrigger}
			<Sidebar.Trigger class="-ml-1" />
		{/if}

		<!-- Where you have just been; hidden on narrow screens, where the
		     header has no room for it, and where a strip of tabs has taken over
		     the naming of the screen. Still mounted in both cases, so the trail
		     keeps recording while it is out of sight. -->
		<div class="trail" class:named-elsewhere={inAssistant}>
			<Breadcrumbs />
		</div>

		{#if inAssistant}
			<AssistantTabs />
		{/if}

		<div class="header-right">
			<button class="icon-btn" aria-label="Toggle theme" onclick={() => theme.toggle()}>
				{#if theme.current === 'dark'}
					<MoonIcon size={16} />
				{:else}
					<SunIcon size={16} />
				{/if}
			</button>
			<form method="POST" action="/logout" style="display: contents;">
				<button type="submit" class="icon-btn" aria-label="Log out">
					<LogOutIcon size={16} />
				</button>
			</form>
		</div>
	</div>
</header>

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--bg-primary) 75%, transparent);
		backdrop-filter: blur(16px) saturate(180%);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		border-bottom: 1px solid var(--border-primary);
	}

	.header-inner {
		display: flex;
		align-items: center;
		height: var(--header-height);
		padding: 0 var(--site-padding);
		max-width: 100%;
		gap: 8px;
	}

	.trail {
		min-width: 0;
		overflow: hidden;
	}

	/* A page is named once. Where the header carries a strip of open documents,
	   the strip is the name and a crumb beside it would be a second copy of it —
	   the way out of that shell is its sidebar's Home, as it is under /settings. */
	.trail.named-elsewhere {
		display: none;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}

	.icon-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	@media (max-width: 768px) {
		.header-inner {
			padding: 0 16px;
			height: 44px;
		}
		.trail {
			display: none;
		}
	}
</style>
