<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import NavUser from '$lib/components/nav-user.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { iconFor } from '$lib/features/icons';
	import { isNavItemActive, settingsNav } from '$lib/navigation';

	/**
	 * The sidebar while you are under `/settings`. The `(app)` layout swaps
	 * this in for `AppSidebar`, so settings is a shell of its own rather than
	 * one more entry in the app nav — you get here from the user menu, and
	 * "Back to app" is how you leave.
	 *
	 * Same anatomy as `AppSidebar` on purpose: sections from
	 * `$lib/navigation`, icons through the one slug map, and the same
	 * `NavUser` footer, so the profile menu never moves.
	 */
	let {
		ref = $bindable(null),
		collapsible = 'offcanvas',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	let user = $derived(page.data.user);

	// A nav, so its entries jump rather than step deeper — the same pairing
	// `AppSidebar` makes; see `$lib/breadcrumbs.svelte`.
	function jumpTo(href: string) {
		breadcrumbs.startAt(href);
		goto(href);
	}
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					class="nav-hover-effect"
					tooltipContent="Back to app"
					onclick={() => jumpTo('/')}
				>
					<ArrowLeftIcon class="h-6 w-6" />
					<span class="sidebar-text font-medium">Back to app</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content class="scrollable-sidebar">
		{#each settingsNav as group (group.label)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.Menu>
					{#each group.items as item (item.href)}
						{@const Icon = iconFor(item.icon)}
						{@const active = isNavItemActive(item, page.url.pathname)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								class={['nav-hover-effect', active && 'nav-active']}
								tooltipContent={item.label}
								onclick={() => jumpTo(item.href)}
							>
								<Icon class="h-6 w-6" />
								<span class="sidebar-text">{item.label}</span>
							</Sidebar.MenuButton>
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
