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
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { QUERY } from '$lib/queries';
	import { renameTierSchema, tierFeaturesSchema } from './schema';

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
		id: 'rename-tier',
		validators: zod4Client(renameTierSchema),
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
		id: 'tier-features',
		validators: zod4Client(tierFeaturesSchema),
		resetForm: false,
		invalidateAll: false,
		dataType: 'json',
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(`${data.tier.name} now unlocks ${form.data.featureIds.length} features`);
			refresh();
		}
	});

	let renamed = $derived($renameData.name.trim() !== data.tier.name);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Plan</Card.Title>
				<Card.Description>
					What customers read. The identifier below is what every row pointing at this plan uses,
					and it cannot change — renaming a key would orphan them.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<dl class="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
					<dt class="text-muted-foreground">Identifier</dt>
					<dd class="font-mono text-xs">{data.tier.id}</dd>

					<dt class="text-muted-foreground">Organizations</dt>
					<dd>{data.tier.organizations}</dd>
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
				<Card.Title>What it unlocks</Card.Title>
				<Card.Description>
					A feature this plan does not unlock is still SHOWN to an organization whose vertical
					includes it — locked, pitching an upgrade. Hiding it altogether is the vertical's axis,
					not this one.
					{#if data.tier.organizations > 0}
						{data.tier.organizations === 1
							? '1 organization is on this plan'
							: `${data.tier.organizations} organizations are on this plan`} and will see the change on
						their next request.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<FormAlert message={$featuresMessage} />
				<form method="POST" action="?/setFeatures" class="space-y-6" use:featuresEnhance>
					<FeaturePicker
						features={data.features}
						bind:selected={$featuresData.featureIds}
						disabled={$savingFeatures}
						idPrefix="tier-feature"
					/>
					<Button type="submit" disabled={$savingFeatures}>
						{$savingFeatures ? 'Saving…' : 'Save changes'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
