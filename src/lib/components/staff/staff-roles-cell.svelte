<script lang="ts">
	import { TagBadge } from '$lib/components/ui/badge/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let {
		roles,
		max = 3,
		emptyLabel = 'No roles'
	}: {
		roles: { id: string; name: string }[];
		/** Badges shown before the rest collapse into one "+N" the tooltip spells out. */
		max?: number;
		/** What an empty set of roles means for this row — it is not always a gap. */
		emptyLabel?: string;
	} = $props();

	const shown = $derived(roles.slice(0, max));
	const hidden = $derived(roles.slice(max));
</script>

{#if roles.length === 0}
	<span class="text-muted-foreground text-xs">{emptyLabel}</span>
{:else}
	<div class="flex flex-wrap items-center gap-1">
		{#each shown as role (role.id)}
			<TagBadge tone="indigo">{role.name}</TagBadge>
		{/each}
		{#if hidden.length > 0}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<TagBadge {...props} tone="neutral">+{hidden.length}</TagBadge>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{hidden.map((role) => role.name).join(', ')}</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>
{/if}
