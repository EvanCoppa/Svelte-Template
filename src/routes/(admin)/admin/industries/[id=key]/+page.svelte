<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import FeaturePicker from '$lib/components/feature-picker.svelte';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { QUERY } from '$lib/queries';
	import { industryFeaturesSchema, renameIndustrySchema } from './schema';

	let { data } = $props();

	function refresh() {
		invalidate(QUERY.adminCatalog);
	}

	const {
		form: renameData,
		errors: renameErrors,
		message: renameMessage,
		submitting: renaming,
		enhance: renameEnhance
	} = superForm(data.renameForm, {
		id: 'rename-industry',
		validators: zod4Client(renameIndustrySchema),
		resetForm: false,
		invalidateAll: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			toast.success(`Renamed to ${form.data.name}`);
			refresh();
		}
	});

	const {
		form: featuresData,
		message: featuresMessage,
		submitting: savingFeatures,
		enhance: featuresEnhance
	} = superForm(data.featuresForm, {
		id: 'industry-features',
		validators: zod4Client(industryFeaturesSchema),
		resetForm: false,
		invalidateAll: false,
		dataType: 'json',
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(`${data.industry.name} now includes ${form.data.featureIds.length} features`);
			refresh();
		}
	});

	/**
	 * The naming rows post their values through ordinary inputs, one form per
	 * feature, so this store never sees what is submitted and a client
	 * validator would misfire — the server validates it instead, the shape the
	 * staff page's per-row forms use. One shared instance carries the enhance
	 * and the message for all of them.
	 */
	const {
		message: namingMessage,
		submitting: savingNaming,
		enhance: namingEnhance
	} = superForm(data.namingForm, {
		id: 'industry-naming',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success('Saved');
			refresh();
		}
	});

	let renamed = $derived($renameData.name.trim() !== data.industry.name);

	/**
	 * The included features, each paired with the registry row it overrides —
	 * so every box can show what it would inherit if it were left blank.
	 * Ordered the way the sidebar would order them: this vertical's own
	 * position where it set one, the feature's default otherwise.
	 */
	let namingRows = $derived(
		data.industry.features
			.map((row) => ({
				...row,
				feature: data.features.find((feature) => feature.id === row.featureId)
			}))
			.filter((row) => row.feature !== undefined)
			.sort(
				(a, b) =>
					(a.sortOrder ?? a.feature!.sortOrder) - (b.sortOrder ?? b.feature!.sortOrder) ||
					a.featureId.localeCompare(b.featureId)
			)
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Vertical</Card.Title>
				<Card.Description>
					The identifier below is what every organization, role and feature row pointing at this
					vertical uses, and it cannot change — renaming a key would orphan them.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<dl class="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
					<dt class="text-muted-foreground">Identifier</dt>
					<dd class="font-mono text-xs">{data.industry.id}</dd>

					<dt class="text-muted-foreground">Organizations</dt>
					<dd>{data.industry.organizations}</dd>
				</dl>

				<FormAlert message={$renameMessage} />
				<form method="POST" action="?/rename" class="space-y-4" use:renameEnhance>
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input
							id="name"
							name="name"
							bind:value={$renameData.name}
							aria-invalid={Boolean($renameErrors.name)}
						/>
						{#if $renameErrors.name}
							<p class="text-destructive text-sm">{$renameErrors.name}</p>
						{/if}
					</div>
					<Button type="submit" disabled={!renamed || $renaming}>
						{$renaming ? 'Saving…' : 'Rename'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>What it includes</Card.Title>
				<Card.Description>
					A feature this vertical does not include does not exist for an organization in it — its
					pages 404, and no plan can unlock it. Taking one out also drops this vertical's words for
					it.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<FormAlert message={$featuresMessage} />
				<form method="POST" action="?/setFeatures" class="space-y-6" use:featuresEnhance>
					<FeaturePicker
						features={data.features}
						bind:selected={$featuresData.featureIds}
						disabled={$savingFeatures}
						idPrefix="industry-feature"
					/>
					<Button type="submit" disabled={$savingFeatures}>
						{$savingFeatures ? 'Saving…' : 'Save changes'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Words and order</Card.Title>
			<Card.Description>
				What this vertical calls each feature it includes, and where the sidebar puts it. Blank
				inherits the feature's own — the placeholder shows what that is. Positions are multiples of
				100, restarting at 100 in each section, so a new feature slots between two others without
				renumbering them.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if namingRows.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No features yet</Empty.Title>
						<Empty.Description>
							Include a feature above and this vertical can name it.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<FormAlert message={$namingMessage} />
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Feature</Table.Head>
							<Table.Head>Name</Table.Head>
							<Table.Head>Noun</Table.Head>
							<Table.Head class="w-28">Order</Table.Head>
							<Table.Head class="w-0"><span class="sr-only">Save</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each namingRows as row (row.featureId)}
							<Table.Row>
								<Table.Cell class="align-middle">
									<span class="font-medium">{row.feature?.name}</span>
									<span class="text-muted-foreground block text-xs">{row.featureId}</span>
								</Table.Cell>
								<Table.Cell colspan={4} class="p-0">
									<form
										method="POST"
										action="?/setNaming"
										class="flex items-center gap-2 py-2 pr-4"
										use:namingEnhance
									>
										<input type="hidden" name="featureId" value={row.featureId} />
										<Input
											name="name"
											value={row.name ?? ''}
											placeholder={row.feature?.name}
											aria-label="What {data.industry.name} calls {row.feature?.name}"
										/>
										<Input
											name="noun"
											value={row.noun ?? ''}
											placeholder={row.feature?.noun ?? '—'}
											aria-label="One row of {row.feature?.name}, in {data.industry.name}'s words"
										/>
										<Input
											name="sortOrder"
											inputmode="numeric"
											class="w-24"
											value={row.sortOrder ?? ''}
											placeholder={String(row.feature?.sortOrder ?? '')}
											aria-label="Where {row.feature?.name} sits in {data.industry.name}'s sidebar"
										/>
										<Button type="submit" variant="outline" size="sm" disabled={$savingNaming}>
											Save
										</Button>
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
