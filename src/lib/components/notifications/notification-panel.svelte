<script lang="ts">
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { goto } from '$app/navigation';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import {
		NOTIFICATION_TABS,
		notificationsIn,
		unreadIn,
		type NotificationTab
	} from '$lib/notifications';
	import { notificationCommands } from '$lib/notifications-api';
	import type { InboxNotification } from '$lib/server/crm/notifications';
	import NotificationRow from './notification-row.svelte';

	/**
	 * What is inside the bell: the three piles, and what you can do to one
	 * notification or to all of them.
	 *
	 * The panel owns the writes because they are the same three calls whichever
	 * pile a row is in, and every one of them ends in one
	 * `invalidate(QUERY.notifications)` from `notificationCommands` — the shell's
	 * load holds the rows, so that single key redraws the list, the tab counts
	 * and the dot on the bell together.
	 *
	 * It owns navigation for the same reason the ⌘K palette does: this is a
	 * shell surface, so leaving it starts the breadcrumb trail at depth 1
	 * rather than recording a step deeper into whatever page happened to be
	 * underneath (CLAUDE.md, "Navigation").
	 */
	let {
		notifications,
		/** Whether the reader keeps the General tab — `notifications.general`. */
		showGeneral,
		/** Close the popover this is drawn in; called after anything that navigates. */
		onclose
	}: {
		notifications: InboxNotification[];
		showGeneral: boolean;
		onclose: () => void;
	} = $props();

	const tabs = $derived(NOTIFICATION_TABS.filter((tab) => tab.id !== 'general' || showGeneral));
	let active = $state<NotificationTab>('inbox');

	// The panel only mounts while the popover is open, so this is the clock for
	// as long as anyone is reading: a row that said "Just now" when it opened
	// should say "1 min ago" a minute later rather than freeze.
	let now = $state(new Date());
	$effect(() => {
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});

	const anythingUnread = $derived(tabs.some((tab) => unreadIn(notifications, tab.id) > 0));

	function jumpTo(href: string) {
		onclose();
		breadcrumbs.startAt(href);
		goto(href);
	}

	function open(notification: InboxNotification) {
		// Fired and not awaited: following the link is what the reader asked
		// for, and the read mark catching up a moment later changes nothing on
		// the screen they are leaving. Skipped outright for a row that is
		// already read — re-opening one should not cost a write and a reload.
		if (!notification.read_at) void notificationCommands.markRead(notification.id);
		if (notification.link) jumpTo(notification.link);
	}
</script>

<div class="flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col">
	<div class="flex items-center gap-2 px-4 pt-3 pb-2">
		<h2 class="text-sm font-semibold">Notifications</h2>
		<div class="ml-auto flex items-center gap-1">
			<Button
				size="xs"
				variant="ghost"
				class="text-muted-foreground"
				disabled={!anythingUnread}
				onclick={() => void notificationCommands.markAllRead()}
			>
				<CheckCheckIcon />
				Mark all as read
			</Button>
			<Button
				size="icon-xs"
				variant="ghost"
				class="text-muted-foreground"
				onclick={() => jumpTo('/settings/preferences')}
			>
				<SettingsIcon />
				<span class="sr-only">Notification settings</span>
			</Button>
		</div>
	</div>

	<Tabs.Root bind:value={active} variant="underline" class="min-h-0 flex-1 gap-0">
		<Tabs.List class="shrink-0 gap-4 px-4">
			{#each tabs as tab (tab.id)}
				{@const unread = unreadIn(notifications, tab.id)}
				<Tabs.Trigger value={tab.id} class="gap-1.5 text-sm">
					{tab.label}
					{#if unread > 0}
						<span
							class="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
						>
							{unread}
						</span>
					{/if}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>

		{#each tabs as tab (tab.id)}
			{@const rows = notificationsIn(notifications, tab.id)}
			<!-- The panel is capped, not fixed: short piles leave it short, and a
			     long one hands its overflow to the ScrollArea, which needs the
			     `min-h-0 flex-1` chain to have a height to scroll inside. -->
			<Tabs.Content value={tab.id} class="mt-0 flex min-h-0 flex-1 flex-col">
				{#if rows.length === 0}
					<p class="text-muted-foreground px-4 py-10 text-center text-sm">{tab.empty}</p>
				{:else}
					<ScrollArea class="min-h-0 flex-1">
						<ul class="divide-border divide-y">
							{#each rows as notification (notification.id)}
								<NotificationRow
									{notification}
									{now}
									onopen={open}
									ondismiss={(row) => void notificationCommands.archive(row.id, true)}
									onrestore={(row) => void notificationCommands.archive(row.id, false)}
								/>
							{/each}
						</ul>
					</ScrollArea>
				{/if}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</div>
