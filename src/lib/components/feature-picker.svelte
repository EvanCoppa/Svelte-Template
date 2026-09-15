<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { iconFor } from '$lib/features/icons';
	import { NAV_CATEGORIES, navCategoryOf } from '$lib/navigation';
	import type { AdminFeature } from '$lib/server/admin/catalog';

	/**
	 * Pick a set of features out of the registry — the control both catalog
	 * axes are edited with: which features a PLAN unlocks, and which ones a
	 * VERTICAL includes at all.
	 *
	 * Deliberately the same shape as the organization's own feature settings
	 * (`/settings/features`): the registry grouped by sidebar section, one
	 * switch per row, an empty section omitted. That page answers the third
	 * axis of the same question, so answering it three different ways would
	 * be the second pattern rule 1 forbids.
	 *
	 * It owns nothing. `selected` is bound to the page's form store — every
	 * caller posts through superforms with `dataType: 'json'`, so the array
	 * goes up as an array and there are no hidden inputs to keep in step.
	 */
	let {
		features,
		selected = $bindable(),
		disabled = false,
		idPrefix = 'feature'
	}: {
		features: AdminFeature[];
		selected: string[];
		disabled?: boolean;
		/** Keeps input ids unique when two pickers are ever on one page. */
		idPrefix?: string;
	} = $props();

	let groups = $derived(
		NAV_CATEGORIES.map((category) => ({
			...category,
			rows: features.filter((feature) => navCategoryOf(feature.category) === category.key)
		})).filter((group) => group.rows.length > 0)
	);

	function setEnabled(id: string, on: boolean) {
		const rest = selected.filter((x) => x !== id);
		selected = on ? [...rest, id] : rest;
	}
</script>

<div class="space-y-6">
	{#each groups as group (group.key)}
		<section class="space-y-1">
			<h3 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
				{group.label}
			</h3>
			<div class="divide-y">
				{#each group.rows as feature (feature.id)}
					{@const Icon = iconFor(feature.icon)}
					<div class="flex items-center gap-4 py-3">
						<Icon class="size-5 shrink-0" />
						<div class="min-w-0 flex-1">
							<Label for={`${idPrefix}-${feature.id}`}>{feature.name}</Label>
							<p class="text-muted-foreground text-xs">{feature.route}</p>
						</div>
						<Switch
							id={`${idPrefix}-${feature.id}`}
							checked={selected.includes(feature.id)}
							onCheckedChange={(on) => setEnabled(feature.id, on)}
							{disabled}
						/>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
