<script lang="ts">
	import { page } from '$app/state';
	import { sourcesOf, type Source } from '$lib/ai/sources';
	import { assistantThread } from '$lib/assistant.svelte';
	import * as ContextPanel from '$lib/components/context-panel/index.js';
	import { RECORD_KIND_META, recordHref, recordTerms } from '$lib/crm/records';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';

	/**
	 * What the assistant's answers drew on, as a rail of the shell rather than
	 * a card inside the page: the `(app)` layout mounts it beside the content
	 * panel while the pathname is under `/assistant`, so it stands the full
	 * height of the body the way the sidebar does on the other side.
	 *
	 * The records come out of the message parts themselves (`sourcesOf()`)
	 * rather than being tracked separately, so a stored thread shows the same
	 * sources on reload as it did while it streamed. The thread reaches here
	 * from the page through `assistantThread`, because the `Chat` that owns it
	 * lives in the page and this does not.
	 */
	let groups = $derived(grouped(sourcesOf(assistantThread.messages)));

	/** What is listed, not what was found: a kind this session cannot open is not somewhere to go. */
	let total = $derived(groups.reduce((count, group) => count + group.sources.length, 0));

	/**
	 * The sources, in piles by kind. A kind is named as this org's industry
	 * names it and only appears at all when `terms` carries its feature —
	 * which is exactly the set this session may see, so a kind the reader
	 * cannot open is never listed as a door.
	 */
	function grouped(sources: Source[]) {
		const kinds = [...new Set(sources.map((source) => source.kind))];
		return kinds.flatMap((kind) => {
			const feature = RECORD_KIND_META[kind].feature;
			if (!page.data.terms?.[feature]) return [];
			return [
				{
					kind,
					label: recordTerms(page.data.terms, kind).name,
					icon: iconFor(iconForPath(`/${RECORD_KIND_META[kind].segment}`, page.data.nav ?? [])),
					href: (id: string) => recordHref(kind, id),
					sources: sources.filter((source) => source.kind === kind)
				}
			];
		});
	}
</script>

<!--
	The same height as the content panel beside it, and pinned there: the shell
	scrolls at the document level, so a rail that simply stood as tall as the
	body would scroll away with it.
-->
<ContextPanel.Root
	class="sticky top-(--shell-gap) my-(--shell-gap) mr-(--shell-gap) h-[calc(100svh_-_2_*_var(--shell-gap))] self-start"
>
	<ContextPanel.Header>
		<ContextPanel.Title>Sources</ContextPanel.Title>
		<ContextPanel.Actions>
			<span class="text-xs tabular-nums">{total}</span>
		</ContextPanel.Actions>
	</ContextPanel.Header>
	<ContextPanel.Body>
		{#each groups as group (group.kind)}
			<ContextPanel.Section label={group.label} count={group.sources.length}>
				{#each group.sources as source (source.id)}
					{@const Icon = group.icon}
					<ContextPanel.Item href={group.href(source.id)}>
						{#snippet icon()}<Icon />{/snippet}
						{source.name}
					</ContextPanel.Item>
				{/each}
			</ContextPanel.Section>
		{:else}
			<p class="text-muted-foreground px-2 py-1.5 text-sm">
				Nothing yet. Records the assistant reads to answer you show up here.
			</p>
		{/each}
	</ContextPanel.Body>
</ContextPanel.Root>
