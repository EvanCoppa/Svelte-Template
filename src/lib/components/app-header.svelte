<script lang="ts">
	import Breadcrumbs from '$lib/components/breadcrumbs.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { theme } from '$lib/theme.svelte';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';

	const sidebar = useSidebar();

	// The toggle lives in the sidebar header now, so the header only carries it
	// while the sidebar is away — otherwise there would be two of them, and no
	// way back once it is closed.
	const sidebarClosed = $derived(
		sidebar.isMobile ? !sidebar.openMobile : sidebar.state === 'collapsed'
	);
</script>

<header class="header">
	<div class="header-inner">
		{#if sidebarClosed}
			<Sidebar.Trigger class="-ml-1" />
		{/if}

		<!-- Where you have just been; hidden on narrow screens, where the
		     header has no room for it. Still mounted there, so the trail keeps
		     recording. -->
		<div class="trail">
			<Breadcrumbs />
		</div>

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
