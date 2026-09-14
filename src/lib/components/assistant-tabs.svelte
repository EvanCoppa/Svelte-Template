<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { openThreads } from '$lib/assistant.svelte';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import * as TabStrip from '$lib/components/tab-strip/index.js';
	import type { ConversationSummary } from '$lib/server/ai/conversations';

	/**
	 * The assistant's open threads, as the app header draws them. The header
	 * mounts it while the pathname is under `/assistant`, the way the `(app)`
	 * layout swaps in `AssistantSidebar` there — a feature that wants a strip
	 * of its own joins the same way, and `TabStrip` itself stays a component
	 * that knows nothing about conversations.
	 *
	 * It reads the threads off `page.data`, like every shell surface, and owns
	 * which of them this browser tab has open (`openThreads`), so the page
	 * below it is only ever the conversation.
	 */
	let conversations: ConversationSummary[] = $derived(page.data.conversations ?? []);

	/** The thread on screen, or null on a new one. */
	let activeId = $derived(page.params.id ?? null);

	// The thread you are reading is open by definition, and a thread the page
	// can no longer see (deleted, or another member's) has no tab to keep.
	afterNavigate(() => {
		if (activeId) openThreads.open(activeId);
		openThreads.keepOnly(new Set(conversations.map((conversation) => conversation.id)));
	});

	/**
	 * Ids are the store's; the names come from the thread list the shell
	 * already has, so a rename renames its tab and a delete drops it with
	 * nothing else to keep in step.
	 */
	let tabs = $derived.by(() => {
		const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
		const open = openThreads.ids
			.filter((id) => byId.has(id))
			.map((id) => ({ id, title: byId.get(id)?.title ?? 'New conversation' }));
		// A thread whose first turn has not landed yet is on screen but not in
		// the list, so it would otherwise have no tab of its own.
		if (!activeId) return [...open, { id: null, title: 'New conversation' }];
		return open;
	});

	/** Where a closed tab hands you: its neighbour, or a new thread. */
	function closeTab(id: string) {
		const index = tabs.findIndex((tab) => tab.id === id);
		openThreads.close(id);
		if (id !== activeId) return;
		const next = tabs[index + 1] ?? tabs[index - 1];
		jumpTo(next?.id ? `/assistant/${next.id}` : '/assistant');
	}

	// The strip is this screen's own navigation, so a tab starts the breadcrumb
	// trail rather than deepening it — the pairing every shell surface makes
	// (see `$lib/breadcrumbs.svelte`). Without it, flicking between two threads
	// reads as walking two steps down.
	function jumpTo(href: string) {
		breadcrumbs.startAt(href);
		goto(href);
	}
</script>

<TabStrip.Root aria-label="Open conversations" class="h-8 min-w-0 flex-1 border-b-0 px-0">
	{#each tabs as tab (tab.id ?? 'new')}
		{@const href = tab.id ? `/assistant/${tab.id}` : '/assistant'}
		<TabStrip.Tab
			{href}
			label={tab.title}
			active={tab.id === activeId}
			onclick={() => breadcrumbs.startAt(href)}
		>
			{#if tab.id}
				{@const id = tab.id}
				<TabStrip.Close label={tab.title} onclick={() => closeTab(id)} />
			{/if}
		</TabStrip.Tab>
	{/each}
	<TabStrip.Add
		href="/assistant"
		label="New conversation"
		onclick={() => breadcrumbs.startAt('/assistant')}
	/>
</TabStrip.Root>
