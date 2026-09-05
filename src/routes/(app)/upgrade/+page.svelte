<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as UpgradeCard from '$lib/components/upgrade-card/index.js';
	import { iconFor } from '$lib/features/icons';

	let { data } = $props();

	let title = $derived.by(() => {
		if (!data.feature) return 'Upgrade your plan';
		if (data.mode === 'locked_visible') {
			return `${data.feature.name} isn't included in the ${data.currentTier.name} plan`;
		}
		return `You already have access to ${data.feature.name}`;
	});

	let description = $derived.by(() => {
		if (data.recommended)
			return `Here's what the ${data.recommended.name} plan adds for your organization.`;
		if (data.feature?.description) return data.feature.description;
		return `You're on the ${data.currentTier.name} plan, which already includes everything.`;
	});

	// The locked feature's own icon fronts its pitch; the generic one sparkles.
	const HeroIcon = $derived(data.feature ? iconFor(data.feature.icon) : SparklesIcon);

	// Plans change on the billing side, never from the browser.
	const contactHref = (tier: string) =>
		`mailto:sales@example.com?subject=${encodeURIComponent(`Upgrade request: ${tier}`)}`;
</script>

<svelte:head>
	<title>Upgrade</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-8">
	<UpgradeCard.Root class="mx-auto w-full max-w-sm">
		<UpgradeCard.Hero><HeroIcon /></UpgradeCard.Hero>
		<UpgradeCard.Header>
			<UpgradeCard.Title>{title}</UpgradeCard.Title>
			{#if data.recommended}
				<UpgradeCard.Badge>{data.recommended.name}</UpgradeCard.Badge>
			{/if}
			<UpgradeCard.Description>{description}</UpgradeCard.Description>
		</UpgradeCard.Header>
		{#if data.recommended}
			<UpgradeCard.Features>
				{#each data.recommended.unlocks as unlock (unlock.id)}
					<UpgradeCard.Feature>
						<UpgradeCard.FeatureTitle>{unlock.name}</UpgradeCard.FeatureTitle>
						{#if unlock.description}
							<UpgradeCard.FeatureDescription>{unlock.description}</UpgradeCard.FeatureDescription>
						{/if}
					</UpgradeCard.Feature>
				{/each}
			</UpgradeCard.Features>
		{/if}
		<UpgradeCard.Footer>
			{#if data.recommended}
				<UpgradeCard.Action href={contactHref(data.recommended.name)}>
					Upgrade to {data.recommended.name}
				</UpgradeCard.Action>
			{/if}
			<UpgradeCard.Dismiss href="/">No thanks</UpgradeCard.Dismiss>
		</UpgradeCard.Footer>
		<UpgradeCard.Close href="/" />
	</UpgradeCard.Root>

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
						<Button href={contactHref(tier.name)} class="w-full">
							Contact us about {tier.name}
						</Button>
					{/if}
				</Card.Footer>
			</Card.Root>
		{/each}
	</div>
</div>
