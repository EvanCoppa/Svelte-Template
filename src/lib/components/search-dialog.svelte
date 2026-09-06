<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LockIcon from '@lucide/svelte/icons/lock';
	import * as Command from '$lib/components/ui/command/index.js';
	import { iconFor, type NavIcon } from '$lib/features/icons';
	import { groupNav, type NavItem } from '$lib/navigation';
	import { showUpgrade } from '$lib/upgrade.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// Derived, not const: the entries change with the active org.
	let groups = $derived(groupNav(page.data.nav ?? []));

	function handleSelect(item: NavItem) {
		open = false;
		// A locked entry never navigates: the upgrade prompt opens in place.
		if (item.locked) showUpgrade(item.featureId);
		else goto(item.href);
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
					{@const value = [item.label, ...(item.aliases ?? [])].join(' ')}
					{#if item.locked}
						<Command.Item {value} onSelect={() => handleSelect(item)}>
							{@render entry(item, Icon)}
						</Command.Item>
					{:else}
						<Command.LinkItem href={item.href} {value} onSelect={() => handleSelect(item)}>
							{@render entry(item, Icon)}
						</Command.LinkItem>
					{/if}
				{/each}
			</Command.Group>
		{/each}
	</Command.List>
</Command.Dialog>

{#snippet entry(item: NavItem, Icon: NavIcon)}
	<Icon class="mr-2 size-4 shrink-0 opacity-60" />
	{item.label}
	{#if item.locked}
		<LockIcon class="text-muted-foreground ml-auto size-3.5" aria-label="Upgrade required" />
	{/if}
{/snippet}
