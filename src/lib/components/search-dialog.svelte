<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LockIcon from '@lucide/svelte/icons/lock';
	import * as Command from '$lib/components/ui/command/index.js';
	import { iconFor } from '$lib/features/icons';
	import { groupNav, navItemTarget, type NavItem } from '$lib/navigation';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// Derived, not const: the entries change with the active org.
	let groups = $derived(groupNav(page.data.nav ?? []));

	function handleSelect(item: NavItem) {
		open = false;
		goto(navItemTarget(item));
	}
</script>

<Command.Dialog bind:open title="Search" description="Jump to a page">
	<Command.Input placeholder="Type to search..." />
	<Command.List>
		<Command.Empty>No results found.</Command.Empty>
		{#each groups as group (group.key)}
			<Command.Group heading={group.label}>
				{#each group.items as item (item.href)}
					{@const Icon = iconFor(item.icon)}
					<Command.LinkItem
						href={navItemTarget(item)}
						value={[item.label, ...(item.aliases ?? [])].join(' ')}
						onSelect={() => handleSelect(item)}
					>
						<Icon class="mr-2 size-4 shrink-0 opacity-60" />
						{item.label}
						{#if item.locked}
							<LockIcon
								class="text-muted-foreground ml-auto size-3.5"
								aria-label="Upgrade required"
							/>
						{/if}
					</Command.LinkItem>
				{/each}
			</Command.Group>
		{/each}
	</Command.List>
</Command.Dialog>
