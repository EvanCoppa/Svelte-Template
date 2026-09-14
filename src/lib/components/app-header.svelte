<script lang="ts">
	import { page } from '$app/state';
	import Breadcrumbs from '$lib/components/breadcrumbs.svelte';
	import * as Notifications from '$lib/components/notifications/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { unreadTotal, type NotificationTab } from '$lib/notifications';
	import { theme } from '$lib/theme.svelte';
	import BellIcon from '@lucide/svelte/icons/bell';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';

	const sidebar = useSidebar();

	// The toggle lives in the sidebar header: on desktop a collapsed sidebar
	// peeks out when the cursor reaches the screen edge, so the button is
	// always reachable and a second one here would only double it. Mobile is
	// the exception — the sidebar is a sheet there, with nothing to hover, so
	// the header keeps the one way in while the sheet is closed.
	const needsTrigger = $derived(sidebar.isMobile && !sidebar.openMobile);

	// The bell. The shell's load owns the rows (they float over every screen,
	// like the note dock's), so the header reads them off page data and the
	// panel inside the popover does the writing.
	const notifications = $derived(page.data.notifications ?? []);
	// An account preference, so the General stream can be switched off — and a
	// tab that is not on screen does not get to add to the count on the bell
	// (docs/user-preferences.md).
	const showGeneral = $derived(page.data.preferences?.['notifications.general'] ?? true);
	const counted = $derived<NotificationTab[]>(showGeneral ? ['inbox', 'general'] : ['inbox']);
	const unread = $derived(unreadTotal(notifications, counted));

	let bellOpen = $state(false);
</script>

<header class="header">
	<div class="header-inner">
		{#if needsTrigger}
			<Sidebar.Trigger class="-ml-1" />
		{/if}

		<!-- Where you have just been; hidden on narrow screens, where the
		     header has no room for it. Still mounted there, so the trail keeps
		     recording. -->
		<div class="trail">
			<Breadcrumbs />
		</div>

		<div class="header-right">
			<!-- The trigger sits here rather than inside the notifications
			     component so it wears the same `.icon-btn` as the two buttons
			     beside it: three pieces of header chrome that should look and
			     behave alike. The panel is what the component owns. -->
			<Popover.Root bind:open={bellOpen}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							class="icon-btn bell"
							aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
						>
							<BellIcon size={16} />
							{#if unread > 0}
								<!-- A dot, not a number: the count is on the tabs inside,
								     where it says which pile it is in. -->
								<span class="unread-dot"></span>
							{/if}
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content align="end" sideOffset={8} class="w-auto overflow-hidden p-0">
					<Notifications.Panel {notifications} {showGeneral} onclose={() => (bellOpen = false)} />
				</Popover.Content>
			</Popover.Root>
			<button class="icon-btn" aria-label="Toggle theme" onclick={() => theme.toggle()}>
				{#if theme.current === 'dark'}
					<MoonIcon size={16} />
				{:else}
					<SunIcon size={16} />
				{/if}
			</button>
			<form method="POST" action="/logout" style="display: contents;">
				<button type="submit" class="icon-btn" aria-label="Log out">
					<LogOutIcon size={16} />
				</button>
			</form>
		</div>
	</div>
</header>

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--bg-primary) 75%, transparent);
		backdrop-filter: blur(16px) saturate(180%);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		border-bottom: 1px solid var(--border-primary);
	}

	.header-inner {
		display: flex;
		align-items: center;
		height: var(--header-height);
		padding: 0 var(--site-padding);
		max-width: 100%;
		gap: 8px;
	}

	.trail {
		min-width: 0;
		overflow: hidden;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}

	.icon-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.bell {
		position: relative;
	}

	/* Sits on the bell's shoulder, ringed in the header's own background so it
	   reads as a badge rather than as part of the glyph. */
	.unread-dot {
		position: absolute;
		top: 5px;
		right: 5px;
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		background: var(--accent-primary);
		box-shadow: 0 0 0 2px var(--bg-primary);
	}

	@media (max-width: 768px) {
		.header-inner {
			padding: 0 16px;
			height: 44px;
		}
		.trail {
			display: none;
		}
	}
</style>
