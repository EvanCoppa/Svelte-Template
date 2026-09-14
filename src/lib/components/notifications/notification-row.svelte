<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import XIcon from '@lucide/svelte/icons/x';
	import { initialsOf } from '$lib/components/staff/member.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { actorName, notificationMeta } from '$lib/notifications';
	import type { InboxNotification } from '$lib/server/crm/notifications';
	import { cn } from '$lib/utils.js';

	/**
	 * One notification, as the panel lists it: who, what, how long ago, and
	 * what to do about it.
	 *
	 * The row owns none of that — the panel passes the notification, the
	 * clock and the three things that can happen to it, which is what lets the
	 * same row draw an unread ask in the Inbox and a month-old row in
	 * Archived with no mode flag of its own.
	 *
	 * Two ways to dismiss, one per row, chosen by whether the notification
	 * asks something of you: a row with an `action_label` is a question and
	 * spells out both answers ("Dismiss" beside "Review"), while a row that
	 * only tells you something keeps its dismissal quiet in the margin, next
	 * to the unread dot. Never both, so there is never a second Dismiss on
	 * screen.
	 */
	let {
		notification,
		now,
		onopen,
		ondismiss,
		onrestore
	}: {
		notification: InboxNotification;
		/** When "now" is, passed in so every row on screen agrees — see `$lib/notifications`. */
		now: Date;
		/** The notification was opened: mark it read and follow its link, if it has one. */
		onopen: (notification: InboxNotification) => void;
		ondismiss: (notification: InboxNotification) => void;
		onrestore: (notification: InboxNotification) => void;
	} = $props();

	const unread = $derived(!notification.read_at && !notification.archived_at);
	const archived = $derived(notification.archived_at !== null);
	const name = $derived(actorName(notification));
	const meta = $derived(notificationMeta(notification, now));
	/** An ask states both answers; everything else dismisses from the margin. */
	const asks = $derived(notification.action_label !== null && !archived);
</script>

<li
	class={cn(
		'group/notification relative flex gap-3 px-4 py-3 transition-colors',
		unread && 'bg-primary/5',
		'hover:bg-accent/60'
	)}
>
	{#if notification.actor}
		<Avatar.Root class="size-8 shrink-0">
			{#if notification.actor.avatar_url}
				<Avatar.Image src={notification.actor.avatar_url} alt="" />
			{/if}
			<Avatar.Fallback
				class={cn(
					'text-[11px] font-semibold',
					Avatar.avatarTint(notification.actor.id, notification.actor.avatar_tint)
				)}
			>
				{initialsOf(name ?? '?')}
			</Avatar.Fallback>
		</Avatar.Root>
	{:else}
		<!-- Nobody did this: the system is saying it. A bell rather than a
		     faceless silhouette, which would read as a person we failed to name. -->
		<span
			class="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
		>
			<BellIcon class="size-4" />
		</span>
	{/if}

	<div class="min-w-0 flex-1">
		<!-- The whole row is the click target (the stretched ::after), so the
		     buttons below and in the margin lift above it with `z-10`. A button
		     rather than a link even when the notification has one: the panel is
		     a shell surface, so a jump out of it starts the breadcrumb trail
		     over rather than stepping deeper, exactly as the ⌘K palette, the
		     sidebar and the note dock do — and opening is also what marks it
		     read. -->
		<Button
			variant="unstyled"
			onclick={() => onopen(notification)}
			class="focus-visible:ring-ring/50 block w-full rounded-sm text-left text-sm leading-snug after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
		>
			<!-- The break has to sit OUTSIDE the if-block: whitespace at the end of a
			     block is trimmed, which runs the name into the title ("Dev Userasked
			     you to…"), while whitespace between the block and the title is
			     interior and survives as the one space that makes it a sentence. With
			     no actor it is leading whitespace at the start of the element, and is
			     trimmed — which is what we want there. -->
			{#if name}<span class="font-semibold">{name}</span>{/if}
			{notification.title}
		</Button>

		{#if notification.body}
			<p class="text-muted-foreground mt-0.5 truncate text-xs">{notification.body}</p>
		{/if}

		<p class="text-muted-foreground mt-1 text-xs">{meta}</p>

		{#if asks || archived}
			<div class="relative z-10 mt-2 flex items-center gap-2">
				{#if archived}
					<Button size="xs" variant="outline" onclick={() => onrestore(notification)}>
						<RotateCcwIcon />
						Restore
					</Button>
				{:else}
					<Button size="xs" variant="outline" onclick={() => ondismiss(notification)}>
						Dismiss
					</Button>
					<Button size="xs" onclick={() => onopen(notification)}>
						{notification.action_label}
					</Button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="relative z-10 flex w-5 shrink-0 flex-col items-center gap-1.5 pt-1">
		{#if unread}
			<span class="bg-primary mt-1 size-2 shrink-0 rounded-full"></span>
			<span class="sr-only">Unread</span>
		{/if}
		{#if !asks && !archived}
			<!-- Quiet until the row is pointed at or tabbed into, and always
			     there below `md`, where there is no hover to reveal it. -->
			<Button
				size="icon-xs"
				variant="ghost"
				class="text-muted-foreground opacity-0 transition-opacity group-focus-within/notification:opacity-100 group-hover/notification:opacity-100 max-md:opacity-100"
				onclick={() => ondismiss(notification)}
			>
				<XIcon />
				<span class="sr-only">Dismiss</span>
			</Button>
		{/if}
	</div>
</li>
