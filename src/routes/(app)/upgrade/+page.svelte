<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { data } = $props();

	let title = $derived.by(() => {
		if (!data.feature) return 'Upgrade your plan';
		if (data.mode === 'locked_visible') {
			return `${data.feature.name} isn't included in the ${data.currentTier.name} plan`;
		}
		return `You already have access to ${data.feature.name}`;
	});
</script>

<svelte:head>
	<title>Upgrade</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="space-y-2 text-center">
		<Badge variant="secondary" class="gap-1.5">
			<SparklesIcon class="size-3.5" />
			Upgrade
		</Badge>
		<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
		<p class="text-muted-foreground mx-auto max-w-md">
			{#if data.feature?.description}
				{data.feature.description}
			{:else}
				Pick a plan to unlock more of the product for your organization.
			{/if}
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each data.tiers as tier (tier.id)}
			<Card.Root class={tier.current ? 'border-primary' : undefined}>
				<Card.Header>
					<Card.Title class="flex items-center justify-between gap-2">
						{tier.name}
						{#if tier.current}
							<Badge>Current</Badge>
						{/if}
					</Card.Title>
					<Card.Description>
						{tier.featureCount}
						{tier.featureCount === 1 ? 'feature' : 'features'}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.feature}
						<p class="flex items-center gap-2 text-sm">
							{#if tier.includes}
								<CheckIcon class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
								<span>Includes {data.feature.name}</span>
							{:else}
								<LockIcon class="text-muted-foreground size-4 shrink-0" />
								<span class="text-muted-foreground">Without {data.feature.name}</span>
							{/if}
						</p>
					{/if}
				</Card.Content>
				<Card.Footer>
					{#if tier.current}
						<Button variant="outline" class="w-full" disabled>Your plan</Button>
					{:else}
						<!-- Plans change on the billing side, never from the browser. -->
						<Button href="mailto:sales@example.com?subject=Upgrade%20request" class="w-full">
							Contact us about {tier.name}
						</Button>
					{/if}
				</Card.Footer>
			</Card.Root>
		{/each}
	</div>

	<div class="text-center">
		<Button href="/" variant="ghost">
			<ArrowLeftIcon class="size-4" />
			Back to the dashboard
		</Button>
	</div>
</div>
