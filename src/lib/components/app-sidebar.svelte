<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import NavUser from '$lib/components/nav-user.svelte';
	import TeamSwitcher from '$lib/components/team-switcher.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { groupNav, isNavItemActive, navItems, visibleNavItems } from '$lib/navigation';
	import type { OrgMembership } from '$lib/org';
	import type { PermissionId } from '$lib/permissions';

	let {
		ref = $bindable(null),
		collapsible = 'offcanvas',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	// These come from the (app) layout load, which App.PageData doesn't declare
	// globally — the annotations keep the derived values fully typed.
	let organizations: OrgMembership[] = $derived(page.data.organizations);
	let activeOrg: OrgMembership = $derived(page.data.activeOrg);
	let user = $derived(page.data.user);
	let permissions: PermissionId[] = $derived(page.data.permissions ?? []);
	let groups = $derived(groupNav(visibleNavItems(navItems, permissions)));
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<TeamSwitcher {organizations} {activeOrg} />
	</Sidebar.Header>
	<Sidebar.Content class="scrollable-sidebar group-data-[peek=true]:pr-2">
		{#each groups as group (group.key)}
			<Sidebar.Group class="ml-2">
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.Menu>
					{#each group.items as item (item.href)}
						{@const active = isNavItemActive(item, page.url.pathname)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								class={['nav-hover-effect', active && 'nav-active']}
								tooltipContent={item.label}
								onclick={() => goto(item.href)}
							>
								<item.icon class="h-6 w-6" />
								<span class="sidebar-text">{item.label}</span>
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer class="pt-0 pr-0 group-data-[peek=true]:pr-2">
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
