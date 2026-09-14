<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { StatusBadge, TagBadge } from '$lib/components/ui/badge/index.js';
	import type { BadgeTone } from '$lib/components/ui/badge/badge-tones.js';
	import { recordInitials } from './facts.js';

	let {
		id,
		name,
		pills = [],
		tags = [],
		children
	}: {
		/** The record's id — the seed its tile is tinted from, never its name. */
		id: string;
		name: string;
		/** The record's lifecycle, beside its name. */
		pills?: readonly { label: string; tone: BadgeTone }[];
		tags?: readonly { id: string; name: string; tone: BadgeTone }[];
		/** The quick facts under the name — a `Detail.Facts` list. */
		children?: Snippet;
	} = $props();

	const initials = $derived(recordInitials(name));
</script>

<div data-slot="detail-identity" class="flex min-w-0 items-start gap-3">
	<!--
		A record's tile is square, the way an app or a company mark is; a round
		one would read as a person even for a product.
	-->
	<div
		class="{Avatar.avatarTint(
			id
		)} flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
	>
		{initials}
	</div>
	<div class="min-w-0 space-y-1">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h1 class="text-2xl font-bold tracking-tight">{name}</h1>
			{#each pills as pill (pill.label)}
				<StatusBadge tone={pill.tone}>{pill.label}</StatusBadge>
			{/each}
			{#each tags as tag (tag.id)}
				<TagBadge tone={tag.tone}>{tag.name}</TagBadge>
			{/each}
		</div>
		{@render children?.()}
	</div>
</div>
