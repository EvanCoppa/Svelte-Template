<script lang="ts">
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Grid3x3Icon from '@lucide/svelte/icons/grid-3x3';
	import PackageIcon from '@lucide/svelte/icons/package';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { recordTerms } from '$lib/crm/records';
	import { featureTerms } from '$lib/features/terms';

	let { data } = $props();

	const terms = $derived(featureTerms(page.data.terms, 'categories'));
	const productTerms = $derived(recordTerms(page.data.terms, 'product'));

	const money = (value: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

	/** The trail above the name, this category dropped: it is the heading. */
	const ancestors = $derived(data.path.slice(0, -1));
</script>

<div class="space-y-6">
	<!--
		The header is the way back, then what this category is. The same shape
		the generic record page uses — an icon button back to the list, since the
		breadcrumb trail is the way back on a wide screen — composed here rather
		than borrowed, because a category has no record detail to render.
	-->
	<PageHeader.Root>
		<div class="flex min-w-0 items-center gap-3">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} href="/categories" variant="ghost" size="icon" class="shrink-0">
							<ArrowLeftIcon />
							<span class="sr-only">All {terms.plural}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>All {terms.plural}</Tooltip.Content>
			</Tooltip.Root>
			<div class="min-w-0">
				{#if ancestors.length > 0}
					<p class="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
						{#each ancestors as ancestor, index (ancestor.id)}
							{#if index > 0}<ChevronRightIcon class="size-3" />{/if}
							<a href="/categories/{ancestor.id}" class="hover:underline">{ancestor.name}</a>
						{/each}
					</p>
				{/if}
				<PageHeader.Title>{data.category.name}</PageHeader.Title>
			</div>
		</div>
	</PageHeader.Root>

	{#if data.category.description}
		<p class="text-muted-foreground max-w-prose text-sm">{data.category.description}</p>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- What sits under it. -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Sub-{terms.plural}</Card.Title>
				<Card.Description>
					{#if data.totalProducts !== data.ownProducts}
						{data.totalProducts}
						{data.totalProducts === 1 ? productTerms.noun : productTerms.plural} in this {terms.noun}
						and everything under it.
					{:else}
						Nothing is filed below this {terms.noun}.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				{#if data.children.length === 0}
					<Empty.Root class="py-10">
						<Empty.Media variant="icon"><Grid3x3Icon /></Empty.Media>
						<Empty.Title>No sub-{terms.plural}</Empty.Title>
						<Empty.Description>This {terms.noun} is a leaf of the tree.</Empty.Description>
					</Empty.Root>
				{:else}
					<ul class="divide-border divide-y">
						{#each data.children as child (child.id)}
							<li class="px-6 py-3">
								<a href="/categories/{child.id}" class="hover:underline">{child.name}</a>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- What is filed directly in it. A product filed in a sub-category is
		     under this one, but it is not IN it — the count above says both. -->
		<Card.Root>
			<Card.Header>
				<Card.Title
					>{productTerms.plural.charAt(0).toUpperCase() + productTerms.plural.slice(1)}</Card.Title
				>
				<Card.Description>
					{data.ownProducts}
					{data.ownProducts === 1 ? productTerms.noun : productTerms.plural} filed directly in this {terms.noun}.
				</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				{#if data.products.length === 0}
					<Empty.Root class="py-10">
						<Empty.Media variant="icon"><PackageIcon /></Empty.Media>
						<Empty.Title>Nothing filed here</Empty.Title>
						<Empty.Description>
							A {productTerms.noun} names its {terms.noun} on its own page.
						</Empty.Description>
					</Empty.Root>
				{:else}
					<ul class="divide-border divide-y">
						{#each data.products as product (product.id)}
							<li class="flex items-center gap-3 px-6 py-3">
								{#if data.canOpenProducts}
									<a href="/products/{product.id}" class="min-w-0 truncate hover:underline">
										{product.name}
									</a>
								{:else}
									<span class="min-w-0 truncate">{product.name}</span>
								{/if}
								{#if product.sku}
									<span class="text-muted-foreground shrink-0 text-xs">{product.sku}</span>
								{/if}
								<span class="text-muted-foreground ms-auto shrink-0 text-sm tabular-nums">
									{money(product.unit_price, product.currency)}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
