<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { ADMIN_AREA_NAME, ADMIN_HOME } from '$lib/admin/nav';
	import AppLogo from '$lib/components/app-logo.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import type { OrgMembership } from '$lib/org';
	import { QUERY } from '$lib/queries';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import { toast } from 'svelte-sonner';

	/**
	 * The workspace picker — and, for a platform operator, the way into the
	 * platform area.
	 *
	 * `systemAdmin` draws that entry and nothing else: it is a menu decision,
	 * not an authorization one, and `/admin` proves the operator flag again on
	 * the server for every page and action it serves. The entry is kept in its
	 * own labelled section because it is NOT an organization — selecting it
	 * navigates out of the tenant app and deliberately leaves the active
	 * organization exactly where it was (docs/platform-administration.md).
	 */
	let {
		organizations,
		activeOrg,
		systemAdmin = false
	}: { organizations: OrgMembership[]; activeOrg: OrgMembership; systemAdmin?: boolean } = $props();

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
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<div class="flex aspect-square size-5 shrink-0 items-center justify-center">
							<AppLogo class="size-5" />
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
				{#each organizations as org (org.id)}
					<DropdownMenu.Item onSelect={() => switchOrg(org)} class="gap-2 p-2">
						<div class="flex size-6 items-center justify-center rounded-md border">
							<AppLogo class="size-3.5 shrink-0" />
						</div>
						{org.name}
						{#if org.id === activeOrg.id}
							<CheckIcon class="ml-auto" />
						{/if}
					</DropdownMenu.Item>
				{/each}
				{#if systemAdmin}
					<DropdownMenu.Separator />
					<DropdownMenu.Label class="text-muted-foreground text-xs">Platform</DropdownMenu.Label>
					<!-- A destination, not a workspace: no org is switched, and no
					     check mark can ever sit beside it. -->
					<DropdownMenu.Item onSelect={() => goto(ADMIN_HOME)} class="gap-2 p-2">
						<div class="flex size-6 items-center justify-center rounded-md border">
							<ShieldIcon class="size-3.5 shrink-0" />
						</div>
						{ADMIN_AREA_NAME}
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
