<script lang="ts">
	import { invalidate } from '$app/navigation';
	import AppLogo from '$lib/components/app-logo.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import type { OrgMembership } from '$lib/org';
	import { QUERY } from '$lib/queries';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { toast } from 'svelte-sonner';

	let { organizations, activeOrg }: { organizations: OrgMembership[]; activeOrg: OrgMembership } =
		$props();

	const sidebar = useSidebar();

	async function switchOrg(org: OrgMembership) {
		if (org.id === activeOrg.id) return;
		const res = await fetch('/api/org', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ orgId: org.id })
		});
		if (res.ok) {
			await invalidate(QUERY.org);
		} else {
			toast.error('Could not switch workspace.');
		}
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<!--
			`notifyPopoverOpenChange` keeps the hover-peek sidebar open while this
			dropdown (whose content portals outside the sidebar's DOM) is open.
		-->
		<DropdownMenu.Root onOpenChange={sidebar.notifyPopoverOpenChange}>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-10 gap-2 group-data-[collapsible=icon]:px-2!"
					>
						<div
							class="bg-sidebar-accent flex aspect-square size-7 shrink-0 items-center justify-center rounded-md"
						>
							<AppLogo class="size-[18px]" />
						</div>
						<span class="truncate font-medium">{activeOrg.name}</span>
						<ChevronDownIcon class="shrink-0 opacity-60" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="z-[60] w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				align="start"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				sideOffset={4}
			>
				<DropdownMenu.Label class="text-muted-foreground text-xs">Workspaces</DropdownMenu.Label>
				<!-- The list scrolls on its own so what you do to a workspace — and the
				     way out — stay in reach. An operator sees every org there is. -->
				<div class="max-h-64 overflow-y-auto">
					{#each organizations as org (org.id)}
						<DropdownMenu.Item onSelect={() => switchOrg(org)} class="h-10 gap-2 p-2">
							<div
								class="bg-sidebar-accent flex size-6 shrink-0 items-center justify-center rounded-md"
							>
								<AppLogo class="size-4 shrink-0" />
							</div>
							<span class="min-w-0 flex-1 truncate font-medium">{org.name}</span>
							{#if org.id === activeOrg.id}
								<CheckIcon class="shrink-0" />
							{/if}
						</DropdownMenu.Item>
					{/each}
				</div>
				<DropdownMenu.Separator />
				<!--
					The way out, here as well as in the user menu: this is the row people
					reach for when they are thinking about the workspace rather than
					about themselves. Both post the same action.
				-->
				<form method="POST" action="/logout">
					<DropdownMenu.Item
						onclick={(event) => {
							event.preventDefault();
							event.currentTarget.closest('form')?.requestSubmit();
						}}
					>
						<LogOutIcon />
						Log out
					</DropdownMenu.Item>
				</form>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
