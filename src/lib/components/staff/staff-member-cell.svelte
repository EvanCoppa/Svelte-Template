<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { TagBadge } from '$lib/components/ui/badge/index.js';
	import type { StaffMember } from '$lib/server/staff';
	import { memberInitials, memberName } from './member.js';

	let {
		member,
		isYou = false
	}: {
		member: StaffMember;
		/** Marks the signed-in user's own row, the way the roster's other rows never are. */
		isYou?: boolean;
	} = $props();

	const name = $derived(memberName(member));
</script>

<div class="flex items-center gap-3">
	<Avatar.Root class="size-9">
		{#if member.avatarUrl}
			<Avatar.Image src={member.avatarUrl} alt="" />
		{/if}
		<Avatar.Fallback class="{Avatar.avatarTint(member.userId)} text-xs font-semibold">
			{memberInitials(member)}
		</Avatar.Fallback>
	</Avatar.Root>
	<div class="min-w-0">
		<div class="flex items-center gap-2">
			<span class="truncate font-medium">{name}</span>
			{#if isYou}
				<TagBadge tone="info" size="sm">You</TagBadge>
			{/if}
		</div>
		<p class="text-muted-foreground truncate text-xs">{member.email ?? '—'}</p>
	</div>
</div>
