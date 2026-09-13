<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { deleteThread, renameThread } from '$lib/assistant.svelte';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import NavUser from '$lib/components/nav-user.svelte';
	import SidebarSearch from '$lib/components/sidebar-search.svelte';
	import TeamSwitcher from '$lib/components/team-switcher.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import type { OrgMembership } from '$lib/org';
	import type { ConversationSummary } from '$lib/server/ai/conversations';

	/**
	 * The sidebar while you are under `/assistant`. The `(app)` layout swaps it
	 * in for `AppSidebar` the way it swaps in `SettingsSidebar` under
	 * `/settings`, so the assistant is a shell of its own: the workspace row and
	 * the collapse trigger stay where they always are, and the nav below them
	 * becomes the one thing this screen navigates — your threads.
	 *
	 * It reads what it needs off `page.data`, like every shell sidebar. Rename
	 * and delete are forms on the assistant page, so a row's menu opens them
	 * through `$lib/assistant.svelte` the way a locked nav entry opens the
	 * upgrade prompt.
	 */
	let {
		ref = $bindable(null),
		collapsible = 'offcanvas',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	const sidebar = useSidebar();

	let organizations: OrgMembership[] = $derived(page.data.organizations ?? []);
	let activeOrg = $derived(page.data.activeOrg);
	let user = $derived(page.data.user);
	let conversations: ConversationSummary[] = $derived(page.data.conversations ?? []);

	/** The thread on screen, or null on a new one. */
	let activeId = $derived(page.params.id ?? null);

	// The "Chats" label gives way to a search field that grows out of the
	// magnifier, so the section keeps one row either way.
	let searching = $state(false);
	let query = $state('');
	let queryInput = $state<HTMLInputElement | null>(null);

	let matches = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return conversations;
		return conversations.filter((conversation) =>
			nameOf(conversation).toLowerCase().includes(needle)
		);
	});

	function nameOf(conversation: ConversationSummary): string {
		return conversation.title ?? 'New conversation';
	}

	function openSearch() {
		searching = true;
		// The field is drawn already; focus it once it is on screen.
		queueMicrotask(() => queryInput?.focus());
	}

	function closeSearch() {
		searching = false;
		query = '';
	}

	// A sidebar jumps: arriving from here starts a walk rather than stepping
	// deeper into the one before it — see `$lib/breadcrumbs.svelte`.
	function jumpTo(href: string) {
		breadcrumbs.startAt(href);
		goto(href);
	}
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<!-- The same row the app shell gives the workspace switcher, so nothing
		     moves when the shell swaps. -->
		<div class="flex items-center gap-1">
			{#if activeOrg}
				<div class="min-w-0 flex-1">
					<TeamSwitcher {organizations} {activeOrg} />
				</div>
			{/if}
			<Sidebar.Trigger class="text-sidebar-foreground/70 shrink-0" />
		</div>
		<SidebarSearch />
	</Sidebar.Header>

	<Sidebar.Content class="scrollable-sidebar">
		<Sidebar.Group>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						class="nav-hover-effect"
						tooltipContent="New chat"
						onclick={() => jumpTo('/assistant')}
					>
						<SquarePenIcon class="h-6 w-6" />
						<span class="sidebar-text">New chat</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						class="nav-hover-effect"
						tooltipContent="Back to app"
						onclick={() => jumpTo('/')}
					>
						<ArrowLeftIcon class="h-6 w-6" />
						<span class="sidebar-text">Back to app</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>

		<Sidebar.Group>
			<!-- One row, two states: the section's name, or the field that grew
			     out of the magnifier at its end. -->
			<div class="relative h-8">
				<Sidebar.GroupLabel
					class={['transition-opacity duration-200', searching && 'pointer-events-none opacity-0']}
				>
					Chats
				</Sidebar.GroupLabel>
				<Button
					variant="ghost"
					size="icon"
					class={[
						'text-sidebar-foreground/70 hover:bg-sidebar-accent absolute top-0 right-0 size-8 transition-opacity duration-200',
						searching && 'pointer-events-none opacity-0'
					]}
					aria-expanded={searching}
					aria-controls="assistant-chat-search"
					onclick={openSearch}
				>
					<SearchIcon class="size-4" />
					<span class="sr-only">Search chats</span>
				</Button>
				<div
					class={[
						'bg-sidebar-accent absolute top-0 right-0 flex h-8 items-center overflow-hidden rounded-md transition-[width,opacity] duration-200 ease-out',
						searching ? 'w-full opacity-100' : 'pointer-events-none w-8 opacity-0'
					]}
				>
					<SearchIcon class="text-sidebar-foreground/60 ml-2 size-4 shrink-0" />
					<Sidebar.Input
						id="assistant-chat-search"
						bind:ref={queryInput}
						bind:value={query}
						placeholder="Search chats"
						aria-label="Search chats"
						tabindex={searching ? 0 : -1}
						class="h-8 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
						onkeydown={(event: KeyboardEvent) => {
							if (event.key === 'Escape') closeSearch();
						}}
					/>
					<Button
						variant="ghost"
						size="icon"
						class="text-sidebar-foreground/70 hover:bg-sidebar-border size-8 shrink-0"
						tabindex={searching ? 0 : -1}
						onclick={closeSearch}
					>
						<XIcon class="size-4" />
						<span class="sr-only">Close chat search</span>
					</Button>
				</div>
			</div>

			<Sidebar.Menu>
				{#each matches as conversation (conversation.id)}
					{@const active = conversation.id === activeId}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							class={['nav-hover-effect', active && 'nav-active']}
							tooltipContent={nameOf(conversation)}
							onclick={() => jumpTo(`/assistant/${conversation.id}`)}
						>
							<span class="sidebar-text truncate">{nameOf(conversation)}</span>
						</Sidebar.MenuButton>
						<!--
							The row's own menu. It portals outside the sidebar, so it tells
							the sidebar it is open — otherwise a peeked sidebar slides shut
							from under it (see `notifyPopoverOpenChange`).
						-->
						<DropdownMenu.Root onOpenChange={sidebar.notifyPopoverOpenChange}>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuAction {...props} showOnHover>
										<PencilIcon />
										<span class="sr-only">Actions for {nameOf(conversation)}</span>
									</Sidebar.MenuAction>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="start" side="right" class="z-[60]">
								<DropdownMenu.Item onclick={() => renameThread(conversation)}>
									<PencilIcon />
									Rename
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onclick={() => deleteThread(conversation)}>
									<Trash2Icon />
									Delete
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Sidebar.MenuItem>
				{:else}
					<Sidebar.MenuItem>
						<span class="text-sidebar-foreground/60 block px-2 py-1.5 text-xs">
							{query.trim() ? 'No chats match that.' : 'No chats yet.'}
						</span>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer class="pt-0">
		<div
			class="border-border bg-background flex w-full flex-col rounded-xl border shadow-sm group-data-[collapsible=icon]:hidden"
		>
			<NavUser {user} />
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
