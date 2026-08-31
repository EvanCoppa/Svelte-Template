<script lang="ts">
	import { enhance } from '$app/forms';
	import SearchDialog from '$lib/components/search-dialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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

<header class="bg-background/75 sticky top-0 z-50 border-b backdrop-blur-lg backdrop-saturate-180">
	<div
		class="flex h-(--header-height) max-w-full items-center gap-2 px-(--site-padding) max-md:h-14 max-md:px-4"
	>
		<Sidebar.Trigger class="-ml-1" />

		<!--
			Opens the ⌘K palette. A Button, not a bespoke element: it inherits the
			focus ring, disabled handling and hover states every other control has.
			`bg-muted` (both modes) is the one colour override — it makes the
			control read as a recessed field rather than a raised button.
		-->
		<Button
			variant="outline"
			class="bg-muted dark:bg-muted text-foreground-subtle hover:border-border-strong w-80 justify-start gap-2 font-normal max-md:w-auto max-md:max-w-[280px] max-md:flex-1"
			onclick={() => (searchOpen = true)}
		>
			<SearchIcon />
			<span class="flex-1 text-left">Search ...</span>
			<!-- kbd defaults to a monospace face; font-sans keeps it on the UI font. -->
			<kbd
				class="text-foreground-subtle rounded border px-1.5 py-0.5 font-sans text-xs max-md:hidden"
			>
				&#8984;K
			</kbd>
		</Button>

		<div class="ml-auto flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				class="text-muted-foreground"
				aria-label="Toggle theme"
				onclick={() => theme.toggle()}
			>
				{#if theme.current === 'dark'}
					<MoonIcon />
				{:else}
					<SunIcon />
				{/if}
			</Button>
			<form method="POST" action="/logout" use:enhance class="contents">
				<Button
					type="submit"
					variant="ghost"
					size="icon"
					class="text-muted-foreground"
					aria-label="Log out"
				>
					<LogOutIcon />
				</Button>
			</form>
		</div>
	</div>
</header>
