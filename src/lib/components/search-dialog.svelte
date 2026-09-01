<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Command from '$lib/components/ui/command/index.js';
	import { groupNav, navItems, visibleNavItems } from '$lib/navigation';
	import type { PermissionId } from '$lib/permissions';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// Same filter as the sidebar, from the same layout data — the palette must
	// never offer a page the server would refuse.
	let permissions: PermissionId[] = $derived(page.data.permissions ?? []);
	let groups = $derived(groupNav(visibleNavItems(navItems, permissions)));

	function handleSelect(href: string) {
		open = false;
		goto(href);
	}
</script>

<Command.Dialog bind:open title="Search" description="Jump to a page">
	<Command.Input placeholder="Type to search..." />
	<Command.List>
		<Command.Empty>No results found.</Command.Empty>
		{#each groups as group (group.key)}
			<Command.Group heading={group.label}>
				{#each group.items as item (item.href)}
					<Command.LinkItem
						href={item.href}
						value={[item.label, ...(item.aliases ?? [])].join(' ')}
						onSelect={() => handleSelect(item.href)}
					>
						<item.icon class="mr-2 size-4 shrink-0 opacity-60" />
						{item.label}
					</Command.LinkItem>
				{/each}
			</Command.Group>
		{/each}
	</Command.List>
</Command.Dialog>
