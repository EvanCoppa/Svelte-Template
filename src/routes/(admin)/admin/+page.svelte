<script lang="ts">
	import { adminNav } from '$lib/admin/nav';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { iconFor } from '$lib/features/icons';

	let { data } = $props();

	/**
	 * The areas this console reaches, each named and iconed by the same list
	 * the bar renders from, so a page added to `adminNav` is a one-line
	 * addition here too. What the card explains is the thing itself — the page
	 * is named once, by its entry.
	 */
	const AREAS = [
		{
			href: '/admin/organizations',
			key: 'organizations',
			blurb: 'Every organization on the platform, with the plan and vertical it is on.'
		},
		{
			href: '/admin/tiers',
			key: 'tiers',
			blurb: 'The plans, and how much of the platform sits on each.'
		},
		{
			href: '/admin/industries',
			key: 'industries',
			blurb: 'The verticals, and the features each one includes.'
		},
		{
			href: '/admin/features',
			key: 'features',
			blurb: 'The registry of what the product is made of.'
		}
	] as const;

	let areas = $derived(
		AREAS.flatMap((area) => {
			const item = adminNav.find((entry) => entry.href === area.href);
			return item ? [{ ...area, label: item.label, icon: item.icon }] : [];
		})
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		{#each areas as area (area.href)}
			{@const Icon = iconFor(area.icon)}
			<a
				href={area.href}
				class="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
			>
				<Card.Root class="hover:border-foreground/20 h-full transition-colors">
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Icon class="size-4 shrink-0" />
							{area.label}
						</Card.Title>
						<Card.Description>{area.blurb}</Card.Description>
					</Card.Header>
					<Card.Content>
						<p class="text-2xl font-semibold tabular-nums">{data.counts[area.key]}</p>
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>
</div>
