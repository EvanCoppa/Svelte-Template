<script lang="ts">
	import { enhance } from '$app/forms';
	import SearchDialog from '$lib/components/search-dialog.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { theme } from '$lib/theme.svelte';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SunIcon from '@lucide/svelte/icons/sun';

	let searchOpen = $state(false);

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			searchOpen = !searchOpen;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<SearchDialog bind:open={searchOpen} />

<header class="header">
	<div class="header-inner">
		<Sidebar.Trigger class="-ml-1" />
		<button class="search-bar" onclick={() => (searchOpen = true)}>
			<SearchIcon size={16} />
			<span>Search ...</span>
			<kbd>&#8984;K</kbd>
		</button>

		<div class="header-right">
			<button class="icon-btn" aria-label="Toggle theme" onclick={() => theme.toggle()}>
				{#if theme.current === 'dark'}
					<MoonIcon size={18} />
				{:else}
					<SunIcon size={18} />
				{/if}
			</button>
			<form method="POST" action="/logout" use:enhance style="display: contents;">
				<button type="submit" class="icon-btn" aria-label="Log out">
					<LogOutIcon size={18} />
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

	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-md);
		padding: 8px 16px;
		color: var(--text-tertiary);
		cursor: pointer;
		width: 320px;
		font-size: 14px;
		font-family: var(--font-sans);
		transition:
			border-color 0.2s,
			background 0.2s;
	}

	.search-bar:hover {
		border-color: var(--border-secondary);
		background: var(--bg-hover);
	}

	.search-bar span {
		flex: 1;
		text-align: left;
	}

	.search-bar kbd {
		font-family: var(--font-sans);
		font-size: 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		border-radius: 4px;
		padding: 2px 6px;
		color: var(--text-tertiary);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
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
			height: 56px;
		}
		.search-bar {
			padding: 10px 16px;
			width: auto;
			flex: 1;
			max-width: 280px;
			font-size: 15px;
		}
		.search-bar kbd {
			display: none;
		}
	}
</style>
