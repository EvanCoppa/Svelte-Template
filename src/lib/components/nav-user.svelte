<script lang="ts">
	import type { User } from '@supabase/supabase-js';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';

	let { user }: { user: User | null } = $props();

	// Supabase stores optional profile fields in user_metadata; fall back to the
	// email so the menu is never blank.
	let displayName = $derived.by(() => {
		const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
		if (typeof name === 'string' && name.trim()) return name;
		return user?.email?.split('@')[0] ?? 'User';
	});
	let avatarUrl = $derived.by(() => {
		const url = user?.user_metadata?.avatar_url;
		return typeof url === 'string' ? url : null;
	});
	let initials = $derived(
		displayName
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0))
			.join('')
			.toUpperCase() || 'U'
	);

	const sidebar = useSidebar();
	const fallbackClasses =
		'rainbow-avatar rounded-full text-xs font-semibold uppercase tracking-wide text-foreground';
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root onOpenChange={sidebar.notifyPopoverOpenChange}>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						class="border-border hover:bg-accent/50 data-[state=open]:bg-accent/50 rounded-none rounded-b-xl border-t transition-all duration-200"
						{...props}
					>
						<Avatar.Root class="size-8 rounded-full">
							{#if avatarUrl}
								<Avatar.Image src={avatarUrl} alt={displayName} />
							{/if}
							<Avatar.Fallback class={fallbackClasses}>{initials}</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-semibold">{displayName}</span>
							<span class="text-muted-foreground truncate text-xs">{user?.email ?? ''}</span>
						</div>
						<ChevronsUpDownIcon class="text-muted-foreground ml-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="z-[60] w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar.Root class="size-8 rounded-full">
							{#if avatarUrl}
								<Avatar.Image src={avatarUrl} alt={displayName} />
							{/if}
							<Avatar.Fallback class={fallbackClasses}>{initials}</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{displayName}</span>
							<span class="truncate text-xs">{user?.email ?? ''}</span>
						</div>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item onclick={() => goto('/settings')}>
						<SettingsIcon />
						Settings
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<form method="POST" action="/logout" use:enhance>
					<DropdownMenu.Item
						onclick={(e) => {
							e.preventDefault();
							e.currentTarget.closest('form')?.requestSubmit();
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

<style>
	:global(.rainbow-avatar) {
		border: 2px solid transparent;
		background:
			linear-gradient(var(--background), var(--background)) padding-box,
			conic-gradient(from 90deg, #f97316, #f43f5e, #ec4899, #6366f1, #22d3ee, #f97316) border-box;
	}
</style>
