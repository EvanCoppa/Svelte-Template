<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { ICONS, iconFor } from '$lib/features/icons';
	import { pairKey } from '$lib/features/pairs';
	import { NAV_CATEGORIES } from '$lib/navigation';
	import { availabilitySchema, catalogSchema } from './schema';

	let { data } = $props();

	const categoryOptions = NAV_CATEGORIES.map(({ key, label }) => ({ value: key, label }));
	// Only slugs the app ships can render — the map in $lib/features/icons is
	// the whole vocabulary, so the picker offers exactly that.
	const iconOptions = Object.keys(ICONS).map((slug) => ({ value: slug, label: slug }));

	const {
		form: catalog,
		errors: catalogErrors,
		message: catalogMessage,
		submitting: savingCatalog,
		enhance: catalogEnhance
	} = superForm(data.catalogForm, {
		validators: zod4Client(catalogSchema),
		dataType: 'json',
		resetForm: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Feature catalog saved');
		}
	});

	const {
		form: availability,
		message: availabilityMessage,
		submitting: savingAvailability,
		enhance: availabilityEnhance
	} = superForm(data.availabilityForm, {
		validators: zod4Client(availabilitySchema),
		dataType: 'json',
		resetForm: false,
		onUpdated({ form }) {
			if (form.valid) toast.success('Feature availability saved');
		}
	});

	function setPair(axis: 'industries' | 'tiers', key: string, on: boolean) {
		const rest = $availability[axis].filter((k) => k !== key);
		$availability[axis] = on ? [...rest, key] : rest;
	}
</script>

<svelte:head>
	<title>Admin · Features</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Catalog</Card.Title>
		<Card.Description>
			How each feature appears in the sidebar and the ⌘K palette. The id and route are fixed by the
			code; adding a feature is still a migration.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$catalogMessage} />
		<form method="POST" action="?/saveCatalog" class="space-y-4" use:catalogEnhance>
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Feature</Table.Head>
							<Table.Head>Name</Table.Head>
							<Table.Head>Description</Table.Head>
							<Table.Head>Icon</Table.Head>
							<Table.Head>Section</Table.Head>
							<Table.Head class="w-24">Order</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						<!-- Rows come from the registry (id, route); the form holds the
						     edits in the same order, so cells index it by position. -->
						{#each data.registry as feature, i (feature.id)}
							{@const Icon = iconFor($catalog.features[i]?.icon)}
							<Table.Row>
								<Table.Cell class="align-top">
									<div class="flex items-center gap-2">
										<Icon class="text-muted-foreground size-4 shrink-0" />
										<div class="leading-tight">
											<div class="font-mono text-xs">{feature.id}</div>
											<div class="text-muted-foreground font-mono text-xs">{feature.route}</div>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell class="min-w-40 align-top">
									<Input
										bind:value={$catalog.features[i].name}
										aria-label="Name of {feature.id}"
										aria-invalid={$catalogErrors.features?.[i]?.name ? 'true' : undefined}
									/>
									{#if $catalogErrors.features?.[i]?.name}
										<p class="text-destructive mt-1 text-xs">
											{$catalogErrors.features[i].name}
										</p>
									{/if}
								</Table.Cell>
								<Table.Cell class="min-w-56 align-top">
									<Input
										bind:value={$catalog.features[i].description}
										aria-label="Description of {feature.id}"
										aria-invalid={$catalogErrors.features?.[i]?.description ? 'true' : undefined}
									/>
									{#if $catalogErrors.features?.[i]?.description}
										<p class="text-destructive mt-1 text-xs">
											{$catalogErrors.features[i].description}
										</p>
									{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<Combobox
										size="sm"
										class="w-44"
										options={iconOptions}
										value={$catalog.features[i].icon}
										onchange={(value) => ($catalog.features[i].icon = value)}
										placeholder="No icon"
										clearable
										ariaLabel="Icon of {feature.id}"
									/>
								</Table.Cell>
								<Table.Cell class="align-top">
									<Combobox
										size="sm"
										class="w-32"
										options={categoryOptions}
										value={$catalog.features[i].category}
										onchange={(value) => ($catalog.features[i].category = value)}
										ariaLabel="Sidebar section of {feature.id}"
									/>
								</Table.Cell>
								<Table.Cell class="align-top">
									<Input
										type="number"
										min="0"
										max="9999"
										bind:value={$catalog.features[i].sort_order}
										aria-label="Sort order of {feature.id}"
										aria-invalid={$catalogErrors.features?.[i]?.sort_order ? 'true' : undefined}
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<Button type="submit" disabled={$savingCatalog}>
				{$savingCatalog ? 'Saving…' : 'Save catalog'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Availability</Card.Title>
		<Card.Description>
			Which industries include a feature at all, and which plans unlock it. In the industry but not
			the plan shows as locked with an upgrade prompt; outside the industry it does not exist.
			Per-organization exceptions live on each organization's page.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$availabilityMessage} />
		<form method="POST" action="?/saveAvailability" class="space-y-4" use:availabilityEnhance>
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Feature</Table.Head>
							{#each data.industries as industry (industry.id)}
								<Table.Head class="text-center">
									<span class="text-muted-foreground block text-[10px] uppercase">Industry</span>
									{industry.name}
								</Table.Head>
							{/each}
							{#each data.tiers as tier (tier.id)}
								<Table.Head class="text-center">
									<span class="text-muted-foreground block text-[10px] uppercase">Plan</span>
									{tier.name}
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.registry as feature (feature.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{feature.name}</Table.Cell>
								{#each data.industries as industry (industry.id)}
									{@const key = pairKey(feature.id, industry.id)}
									<Table.Cell class="text-center">
										<Checkbox
											checked={$availability.industries.includes(key)}
											onCheckedChange={(on) => setPair('industries', key, on)}
											aria-label="{feature.name} in {industry.name}"
										/>
									</Table.Cell>
								{/each}
								{#each data.tiers as tier (tier.id)}
									{@const key = pairKey(feature.id, tier.id)}
									<Table.Cell class="text-center">
										<Checkbox
											checked={$availability.tiers.includes(key)}
											onCheckedChange={(on) => setPair('tiers', key, on)}
											aria-label="{feature.name} on the {tier.name} plan"
										/>
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<Button type="submit" disabled={$savingAvailability}>
				{$savingAvailability ? 'Saving…' : 'Save availability'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>
