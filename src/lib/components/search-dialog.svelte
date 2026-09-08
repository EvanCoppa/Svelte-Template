<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LockIcon from '@lucide/svelte/icons/lock';
	import * as Command from '$lib/components/ui/command/index.js';
	import { iconFor, type NavIcon } from '$lib/features/icons';
	import { groupNav, settingsNavItems, type NavItem, type SettingsNavItem } from '$lib/navigation';
	import { searchPalette } from '$lib/search.svelte';
	import { showUpgrade } from '$lib/upgrade.svelte';

	/**
	 * The one palette, mounted by the (app) layout. It is opened from the
	 * sidebar's search button via `showSearch()` and by the shortcut below,
	 * so the two can never disagree about whether it is showing.
	 */

	// Derived, not const: the entries change with the active org.
	let groups = $derived(groupNav(page.data.nav ?? []));
	// Settings has left the sidebar, so the palette is how you reach a section
	// of it without going through the user menu first. Same list the settings
	// sidebar renders — never gated, so it needs no filtering.
	const settings = settingsNavItems();

	function handleSelect(item: NavItem) {
		searchPalette.dismiss();
		// A locked entry never navigates: the upgrade prompt opens in place.
		if (item.locked) showUpgrade(item.featureId);
		else goto(item.href);
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			searchPalette.toggle();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<Command.Dialog
	bind:open={
		() => searchPalette.open, (open) => (open ? searchPalette.show() : searchPalette.dismiss())
	}
	title="Search"
	description="Jump to a page"
>
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
		<Command.Group heading="Settings">
			{#each settings as item (item.href)}
				{@const Icon = iconFor(item.icon)}
				{@const value = ['Settings', item.label, ...(item.aliases ?? [])].join(' ')}
				<Command.LinkItem href={item.href} {value} onSelect={() => searchPalette.dismiss()}>
					{@render entry(item, Icon)}
				</Command.LinkItem>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Dialog>

{#snippet entry(item: NavItem | SettingsNavItem, Icon: NavIcon)}
	<Icon class="mr-2 size-4 shrink-0 opacity-60" />
	{item.label}
	{#if 'locked' in item && item.locked}
		<LockIcon class="text-muted-foreground ml-auto size-3.5" aria-label="Upgrade required" />
	{/if}
{/snippet}
