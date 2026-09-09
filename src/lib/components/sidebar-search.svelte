<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { showSearch } from '$lib/search.svelte';
</script>

<!--
	The ⌘K palette's button, sitting in a sidebar header below the workspace
	switcher it is spaced away from. Both shells (`AppSidebar` and
	`SettingsSidebar`) render it, so the palette is reachable from the same spot
	wherever you are. The dialog itself is the one the (app) layout mounts;
	`showSearch()` opens it. It reads as a filled field rather than an outlined
	button — the muted fill is what says "type here"; in icon mode the base
	`size-8!` collapses it back to the icon, so the extra height and margin are
	dropped there too.
-->
<Sidebar.Menu class="mt-3 group-data-[collapsible=icon]:mt-0">
	<Sidebar.MenuItem>
		<Sidebar.MenuButton
			class="bg-sidebar-accent text-sidebar-foreground/55 hover:bg-sidebar-border hover:text-sidebar-foreground/70 h-10 gap-2.5 rounded-lg px-3 group-data-[collapsible=icon]:px-2! [&>svg]:size-[18px]"
			tooltipContent="Search"
			onclick={() => showSearch()}
		>
			<SearchIcon />
			<span class="flex-1 text-left">Search...</span>
			<kbd
				class="border-sidebar-border bg-sidebar text-sidebar-foreground/60 rounded-md border px-1.5 py-0.5 text-[10px] leading-none font-medium"
			>
				&#8984;K
			</kbd>
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
</Sidebar.Menu>
