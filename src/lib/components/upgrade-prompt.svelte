<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import * as UpgradeModal from '$lib/components/upgrade-modal/index.js';
	import { iconFor } from '$lib/features/icons';
	import { pitchFor, type UpgradePlan } from '$lib/features/plans';
	import { upgradePrompt } from '$lib/upgrade.svelte';

	/**
	 * The one upgrade dialog, mounted by the (app) layout and opened from
	 * anywhere with `showUpgrade()` (see `$lib/upgrade.svelte`). The plans
	 * come from the layout load; the pitch is derived here from whichever
	 * feature the caller named.
	 */
	let { plans, currentTier }: { plans: UpgradePlan[]; currentTier: string } = $props();

	const pitch = $derived(pitchFor(plans, upgradePrompt.featureId));
	const title = $derived(
		pitch?.feature
			? `${pitch.feature.name} isn't included in the ${currentTier} plan`
			: 'Upgrade your plan'
	);
	const description = $derived(
		pitch
			? `Here's what the ${pitch.plan.name} plan adds for your organization.`
			: `You're on the ${currentTier} plan, which already includes everything.`
	);
	// The locked feature's own icon fronts its pitch; the generic one sparkles.
	const HeroIcon = $derived(pitch?.feature ? iconFor(pitch.feature.icon) : SparklesIcon);
	// Plans change on the billing side, never from the browser.
	const contactHref = $derived(
		pitch
			? `mailto:sales@example.com?subject=${encodeURIComponent(`Upgrade request: ${pitch.plan.name}`)}`
			: undefined
	);

	// The feature gate cannot open a dialog, so it sends a locked route to the
	// dashboard with `?upgrade=<id>`. Consumed here on arrival — a full load
	// and a client-side redirect alike — and taken off the URL so a reload or
	// a copied link stays clean. The first `afterNavigate` fires a beat before
	// the router reports itself started, hence the tick before `replaceState`.
	afterNavigate(async ({ to }) => {
		const wanted = to?.url.searchParams.get('upgrade');
		if (!to || wanted == null) return;
		upgradePrompt.show(wanted || undefined);
		// Built from the router's own target, so the base path is already in it.
		const clean = new URL(to.url);
		clean.searchParams.delete('upgrade');
		await tick();
		replaceState(clean, page.state);
	});
</script>

<UpgradeModal.Root
	bind:open={() => upgradePrompt.open, (open) => (open ? undefined : upgradePrompt.dismiss())}
>
	<UpgradeModal.Content>
		<UpgradeModal.Hero><HeroIcon /></UpgradeModal.Hero>
		<UpgradeModal.Header>
			<UpgradeModal.Title>{title}</UpgradeModal.Title>
			{#if pitch}
				<UpgradeModal.Badge>{pitch.plan.name}</UpgradeModal.Badge>
			{/if}
			<UpgradeModal.Description>{description}</UpgradeModal.Description>
		</UpgradeModal.Header>
		{#if pitch}
			<UpgradeModal.Features>
				{#each pitch.unlocks as unlock (unlock.id)}
					<UpgradeModal.Feature>
						<UpgradeModal.FeatureTitle>{unlock.name}</UpgradeModal.FeatureTitle>
						{#if unlock.description}
							<UpgradeModal.FeatureDescription>{unlock.description}</UpgradeModal.FeatureDescription
							>
						{/if}
					</UpgradeModal.Feature>
				{/each}
			</UpgradeModal.Features>
		{/if}
		<UpgradeModal.Footer>
			{#if pitch}
				<UpgradeModal.Action href={contactHref}>Upgrade to {pitch.plan.name}</UpgradeModal.Action>
			{/if}
			<UpgradeModal.Dismiss>{pitch ? 'No thanks' : 'Got it'}</UpgradeModal.Dismiss>
		</UpgradeModal.Footer>
		<UpgradeModal.Close />
	</UpgradeModal.Content>
</UpgradeModal.Root>
