<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { showSearch } from '$lib/search.svelte';
</script>

<!--
	The ⌘K palette's button, sitting in a sidebar header above the nav it jumps
	to. Both shells (`AppSidebar` and `SettingsSidebar`) render it, so the
	palette is reachable from the same spot wherever you are. The dialog itself
	is the one the (app) layout mounts; `showSearch()` opens it.
-->
<Sidebar.Menu>
	<Sidebar.MenuItem>
		<Sidebar.MenuButton
			class="border-sidebar-border bg-sidebar text-sidebar-foreground/70 hover:bg-sidebar-accent border"
			tooltipContent="Search"
			onclick={() => showSearch()}
		>
			<SearchIcon />
			<span class="flex-1 text-left">Search ...</span>
			<kbd class="border-sidebar-border rounded border px-1 py-px text-[10px] leading-none">
				&#8984;K
			</kbd>
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
</Sidebar.Menu>
