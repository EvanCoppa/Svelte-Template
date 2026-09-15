<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import UsersIcon from '@lucide/svelte/icons/users';
	import type { Activity } from '$lib/server/crm/activities';

	/**
	 * One entry on a record's timeline: what happened, when, and who logged
	 * it. The page owns the names — an author arrives already resolved.
	 */
	let {
		activity,
		author = null
	}: {
		activity: Activity;
		/** Who logged it, or null when nobody can be named (the author left, or was never set). */
		author?: string | null;
	} = $props();

	const ICONS = {
		note: StickyNoteIcon,
		call: PhoneIcon,
		email: MailIcon,
		meeting: UsersIcon,
		sms: MessageSquareIcon,
		other: CircleDashedIcon,
		stage_changed: ArrowRightIcon,
		owner_changed: UserCogIcon
	} satisfies Record<Activity['type'], typeof MailIcon>;

	// System kinds get a word rather than their snake_case column value; every
	// human kind still falls out of the type itself, capitalized.
	function labelFor(type: Activity['type']): string {
		switch (type) {
			case 'stage_changed':
				return 'Stage changed';
			case 'owner_changed':
				return 'Owner changed';
			default:
				return type.charAt(0).toUpperCase() + type.slice(1);
		}
	}

	// Fixed locale, like every date on a page — see the staff page.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

	const Icon = $derived(ICONS[activity.type]);
	const kind = $derived(labelFor(activity.type));
	// "Call · outbound · 18 min · Dev User" — whichever of those this entry has.
	const byline = $derived(
		[
			kind,
			activity.direction,
			activity.duration_minutes === null ? null : `${String(activity.duration_minutes)} min`,
			author
		]
			.filter((part) => part !== null)
			.join(' · ')
	);
</script>

<li data-slot="detail-activity" class="flex gap-3">
	<div
		class="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
	>
		<Icon class="size-4" />
	</div>
	<div class="min-w-0 flex-1 space-y-1">
		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
			<p class="text-sm font-medium">{activity.subject ?? kind}</p>
			<time datetime={activity.occurred_at} class="text-muted-foreground text-xs whitespace-nowrap">
				{datetime.format(new Date(activity.occurred_at))}
			</time>
		</div>
		{#if activity.body}
			<p class="text-muted-foreground text-sm whitespace-pre-line">{activity.body}</p>
		{/if}
		<p class="text-muted-foreground text-xs">{byline}</p>
	</div>
</li>
