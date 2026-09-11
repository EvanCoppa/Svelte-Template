<script lang="ts">
	import type { PreviewRow } from '$lib/schemas/imports';

	/**
	 * Why a row is what it is: the values its kind refuses, the row it
	 * repeats, or the record it matches and every field it would change on
	 * it. The page passes the row and the word for its kind; nothing here
	 * decides anything.
	 */
	let { row, noun }: { row: PreviewRow; noun: string } = $props();
</script>

<div data-slot="import-row-details" class="space-y-1 text-xs">
	{#if row.status === 'invalid'}
		<ul class="text-destructive space-y-0.5">
			{#each row.errors as issue (issue.field + issue.message)}
				<li>{issue.message}</li>
			{/each}
		</ul>
	{:else if row.status === 'duplicate'}
		<p class="text-muted-foreground">Same as row {row.duplicateOf} — only the first is imported.</p>
	{:else if row.status === 'match' && row.match}
		<p class="text-muted-foreground">
			Same {noun} as <span class="text-foreground font-medium">{row.match.name}</span>
			(by {row.match.by})
		</p>
		{#if row.match.changes.length === 0}
			<p class="text-muted-foreground">No changes — the file says what the record already says.</p>
		{:else}
			<ul class="space-y-0.5">
				{#each row.match.changes as change (change.field)}
					<li>
						<span class="text-muted-foreground">{change.label}:</span>
						<span class="text-muted-foreground line-through">{change.from || '—'}</span>
						<span class="font-medium">{change.to}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p class="text-muted-foreground">Will be added.</p>
	{/if}
</div>
