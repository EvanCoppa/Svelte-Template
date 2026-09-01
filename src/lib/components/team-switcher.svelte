<script lang="ts">
	import { invalidate } from '$app/navigation';
	import AppLogo from '$lib/components/app-logo.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import type { OrgMembership } from '$lib/org';
	import { QUERY } from '$lib/queries';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { toast } from 'svelte-sonner';

	let { organizations, activeOrg }: { organizations: OrgMembership[]; activeOrg: OrgMembership } =
		$props();

	const sidebar = useSidebar();

	async function switchOrg(org: OrgMembership) {
		if (org.id === activeOrg.id) return;
		// fetch itself rejects on network failure (not just !res.ok), and onSelect
		// floats this promise — so both failure shapes must land on the toast.
		try {
			const res = await fetch('/api/org', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ orgId: org.id })
			});
			if (!res.ok) throw new Error(`switch failed: ${String(res.status)}`);
			await invalidate(QUERY.org);
		} catch {
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
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<div class="flex aspect-square size-8 items-center justify-center rounded-lg">
							<AppLogo class="size-6" />
						</div>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{activeOrg.name}</span>
							<span class="truncate text-xs">{activeOrg.tierName}</span>
						</div>
						<ChevronsUpDownIcon class="ml-auto" />
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
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
