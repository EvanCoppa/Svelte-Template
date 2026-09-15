<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { adminIndustryHref, adminTierHref } from '$lib/admin/nav';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ICONS, iconFor } from '$lib/features/icons';
	import { NAV_CATEGORIES } from '$lib/navigation';
	import { QUERY } from '$lib/queries';
	import { updateFeatureSchema } from './schema';

	let { data } = $props();

	const {
		form,
		errors,
		message,
		submitting,
		enhance: formEnhance
	} = superForm(data.form, {
		validators: zod4Client(updateFeatureSchema),
		resetForm: false,
		invalidateAll: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			toast.success(`${form.data.name} saved`);
			invalidate(QUERY.adminCatalog);
		}
	});

	const iconOptions = Object.keys(ICONS).map((slug) => ({ value: slug, label: slug }));
	const categoryOptions = NAV_CATEGORIES.map((category) => ({
		value: category.key,
		label: category.label
	}));

	let Preview = $derived(iconFor($form.icon));

	let unlockedBy = $derived(data.tiers.filter((tier) => data.feature.tierIds.includes(tier.id)));
	let includedBy = $derived(
		data.industries.filter((industry) => data.feature.industryIds.includes(industry.id))
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Registry row</Card.Title>
				<Card.Description>
					The default words and position every vertical falls back to. A vertical that sets its own
					name, noun or order wins over this — see that vertical's page.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<dl class="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
					<dt class="text-muted-foreground">Identifier</dt>
					<dd class="font-mono text-xs">{data.feature.id}</dd>

					<dt class="text-muted-foreground">Route</dt>
					<dd class="font-mono text-xs">{data.feature.route}</dd>
				</dl>
				<p class="text-muted-foreground text-xs">
					Both are facts about the code — the gate matches requests against the route, and the id is
					what migrations and grants point at. They change by migration, with the route they
					describe.
				</p>

				<FormAlert message={$message} />
				<form method="POST" action="?/save" class="space-y-4" use:formEnhance>
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input
							id="name"
							name="name"
							bind:value={$form.name}
							aria-invalid={Boolean($errors.name)}
						/>
						{#if $errors.name}
							<p class="text-destructive text-sm">{$errors.name}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="noun">Noun</Label>
						<Input
							id="noun"
							name="noun"
							placeholder="one row of it, lower case"
							bind:value={$form.noun}
							aria-invalid={Boolean($errors.noun)}
						/>
						{#if $errors.noun}
							<p class="text-destructive text-sm">{$errors.noun}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="description">Description</Label>
						<Input
							id="description"
							name="description"
							bind:value={$form.description}
							aria-invalid={Boolean($errors.description)}
						/>
						{#if $errors.description}
							<p class="text-destructive text-sm">{$errors.description}</p>
						{/if}
					</div>

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="icon">Icon</Label>
							<div class="flex items-center gap-2">
								<Preview class="text-muted-foreground size-4 shrink-0" />
								<Combobox
									id="icon"
									name="icon"
									bind:value={$form.icon}
									options={iconOptions}
									invalid={Boolean($errors.icon)}
									class="w-full"
								/>
							</div>
							{#if $errors.icon}
								<p class="text-destructive text-sm">{$errors.icon}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="category">Section</Label>
							<Combobox
								id="category"
								name="category"
								bind:value={$form.category}
								options={categoryOptions}
								invalid={Boolean($errors.category)}
								class="w-full"
							/>
							{#if $errors.category}
								<p class="text-destructive text-sm">{$errors.category}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="sortOrder">Order</Label>
							<Input
								id="sortOrder"
								name="sortOrder"
								inputmode="numeric"
								bind:value={$form.sortOrder}
								aria-invalid={Boolean($errors.sortOrder)}
							/>
							{#if $errors.sortOrder}
								<p class="text-destructive text-sm">{$errors.sortOrder}</p>
							{/if}
						</div>
					</div>
					<p class="text-muted-foreground text-xs">
						Only slugs the app ships are offered: an icon is resolved through a one-per-file map, so
						a new one is a code change. Positions are multiples of 100, restarting at 100 in each
						section.
					</p>

					<Button type="submit" disabled={$submitting}>
						{$submitting ? 'Saving…' : 'Save changes'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Where it appears</Card.Title>
				<Card.Description>
					Both axes are edited from the other side: a plan's page says what it unlocks, a vertical's
					says what it includes.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<section class="space-y-2">
					<h2 class="text-sm font-medium">Unlocked by</h2>
					{#if unlockedBy.length === 0}
						<p class="text-muted-foreground text-sm">
							No plan unlocks it, so every vertical that includes it shows it locked, pitching an
							upgrade.
						</p>
					{:else}
						<ul class="flex flex-wrap gap-2">
							{#each unlockedBy as tier (tier.id)}
								<li>
									<a href={adminTierHref(tier.id)} class="rounded-sm focus-visible:ring-2">
										<Badge variant="outline">{tier.name}</Badge>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section class="space-y-2">
					<h2 class="text-sm font-medium">Included by</h2>
					{#if includedBy.length === 0}
						<p class="text-muted-foreground text-sm">
							No vertical includes it, so it does not exist for any organization — its pages 404.
						</p>
					{:else}
						<ul class="flex flex-wrap gap-2">
							{#each includedBy as industry (industry.id)}
								<li>
									<a href={adminIndustryHref(industry.id)} class="rounded-sm focus-visible:ring-2">
										<Badge variant="outline">{industry.name}</Badge>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</Card.Content>
		</Card.Root>
	</div>
</div>
