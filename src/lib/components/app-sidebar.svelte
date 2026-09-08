<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SearchIcon from '@lucide/svelte/icons/search';
	import NavUser from '$lib/components/nav-user.svelte';
	import TeamSwitcher from '$lib/components/team-switcher.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { iconFor } from '$lib/features/icons';
	import { groupNav, isNavItemActive } from '$lib/navigation';
	import { showSearch } from '$lib/search.svelte';
	import { showUpgrade } from '$lib/upgrade.svelte';
	import type { OrgMembership } from '$lib/org';

	let {
		ref = $bindable(null),
		collapsible = 'offcanvas',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	// These come from the (app) layout load, which App.PageData declares as
	// optional (public routes have no org) — the annotations keep the derived
	// values fully typed for the shell, which only ever renders signed in.
	let organizations: OrgMembership[] = $derived(page.data.organizations ?? []);
	let activeOrg = $derived(page.data.activeOrg);
	let user = $derived(page.data.user);
	// Already filtered by mode and grant on the server; nothing to check here.
	let groups = $derived(groupNav(page.data.nav ?? []));
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<!-- One row: logo, workspace name, its dropdown chevron — and the sidebar's
		     own collapse button, sitting where the switcher's chevrons used to. -->
		<div class="flex items-center gap-1">
			{#if activeOrg}
				<div class="min-w-0 flex-1">
					<TeamSwitcher {organizations} {activeOrg} />
				</div>
			{/if}
			<Sidebar.Trigger class="text-sidebar-foreground/70 shrink-0" />
		</div>

		<!-- The ⌘K palette's button, above the nav it jumps to. The dialog itself
		     is the one the (app) layout mounts; `showSearch()` opens it. -->
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
	</Sidebar.Header>
	<Sidebar.Content class="scrollable-sidebar">
		{#each groups as group (group.key)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.Menu>
					{#each group.items as item (item.href)}
						{@const Icon = iconFor(item.icon)}
						{@const active = !item.locked && isNavItemActive(item, page.url.pathname)}
						<!-- A locked entry never navigates: the upgrade prompt opens in place. -->
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								class={['nav-hover-effect', active && 'nav-active', item.locked && 'opacity-60']}
								tooltipContent={item.locked ? `${item.label} — upgrade required` : item.label}
								onclick={() => (item.locked ? showUpgrade(item.featureId) : goto(item.href))}
							>
								<Icon class="h-6 w-6" />
								<span class="sidebar-text">{item.label}</span>
							</Sidebar.MenuButton>
							{#if item.locked}
								<Sidebar.MenuBadge>
									<LockIcon class="size-3.5" aria-label="Upgrade required" />
								</Sidebar.MenuBadge>
							{/if}
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer class="pt-0">
		<div
			class="border-border bg-background flex w-full flex-col rounded-xl border shadow-sm group-data-[collapsible=icon]:hidden"
		>
			<NavUser {user} />
		</div>
	</Sidebar.Footer>
</Sidebar.Root>

<style>
	:global(.scrollable-sidebar) {
		overflow-y: auto;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE and Edge */
		-webkit-mask-image: linear-gradient(to bottom, black calc(100% - 4rem), transparent 100%);
		mask-image: linear-gradient(to bottom, black calc(100% - 4rem), transparent 100%);
	}

	:global(.scrollable-sidebar::-webkit-scrollbar) {
		display: none; /* Chrome, Safari, Opera */
	}

	:global(.nav-hover-effect) {
		transition: all 0.3s ease;
	}

	:global(.nav-hover-effect:hover) {
		transform: translateX(4px);
	}

	:global(.nav-active) {
		background-color: white;
		border-radius: 0.5rem;
	}

	/* A white active pill would flare on the dark sidebar — use its accent. */
	:global(html.dark .nav-active) {
		background-color: var(--sidebar-accent);
	}
</style>
