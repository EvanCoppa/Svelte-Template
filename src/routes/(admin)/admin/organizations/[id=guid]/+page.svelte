<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { invalidate } from '$app/navigation';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { iconFor } from '$lib/features/icons';
	import { QUERY } from '$lib/queries';
	import {
		OVERRIDE_MODE_OPTIONS,
		renameSchema,
		setIndustrySchema,
		setOverrideSchema,
		setTierSchema
	} from './schema';

	let { data } = $props();

	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	/**
	 * Five forms, five stores, and every one of them re-reads the page after a
	 * success rather than trusting what it posted: `QUERY.adminOrganizations`
	 * is this page's own key, and a write that lands changes what the next
	 * card shows (a plan change changes which features an override is even
	 * arguing with). `invalidateAll` stays off — the platform area shares
	 * nothing with the tenant load graph.
	 */
	function refresh() {
		invalidate(QUERY.adminOrganizations);
	}

	const {
		form: renameData,
		errors: renameErrors,
		message: renameMessage,
		submitting: renaming,
		enhance: renameEnhance
	} = superForm(data.renameForm, {
		id: 'rename',
		validators: zod4Client(renameSchema),
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
		form: tierData,
		errors: tierErrors,
		message: tierMessage,
		submitting: movingTier,
		enhance: tierEnhance
	} = superForm(data.tierForm, {
		id: 'set-tier',
		validators: zod4Client(setTierSchema),
		resetForm: false,
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(`${data.organization.name} moved to ${planName(form.data.tierId)}`);
			refresh();
		}
	});

	const {
		form: industryData,
		errors: industryErrors,
		message: industryMessage,
		submitting: movingIndustry,
		enhance: industryEnhance
	} = superForm(data.industryForm, {
		id: 'set-industry',
		validators: zod4Client(setIndustrySchema),
		resetForm: false,
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(`${data.organization.name} moved to ${industryName(form.data.industryId)}`);
			$industryData.confirm = '';
			refresh();
		}
	});

	const {
		form: overrideData,
		errors: overrideErrors,
		message: overrideMessage,
		submitting: savingOverride,
		enhance: overrideEnhance
	} = superForm(data.overrideForm, {
		id: 'set-override',
		validators: zod4Client(setOverrideSchema),
		resetForm: true,
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(`${featureName(form.data.featureId)} override saved`);
			refresh();
		}
	});

	/**
	 * The clear button posts its feature id through a hidden input per row, so
	 * this store never sees what is submitted and a client validator would
	 * misfire — the server validates it instead, the shape the staff page's
	 * five id-only forms use.
	 */
	const {
		message: clearMessage,
		submitting: clearing,
		enhance: clearEnhance
	} = superForm(data.clearForm, {
		id: 'clear-override',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success('Override cleared');
			refresh();
		}
	});

	// Plans, cheapest first, each saying what it unlocks — the same ordering
	// the tiers directory lists them in.
	let planOptions = $derived(
		data.tiers.map((tier) => ({
			value: tier.id,
			label: tier.name,
			hint: `${tier.features} features`
		}))
	);

	let industryOptions = $derived(
		data.industries.map((industry) => ({
			value: industry.id,
			label: industry.name,
			hint: `${industry.features} features`
		}))
	);

	let featureOptions = $derived(
		data.features.map((feature) => ({
			value: feature.id,
			label: feature.name,
			hint: feature.route
		}))
	);

	function planName(id: string): string {
		return data.tiers.find((tier) => tier.id === id)?.name ?? id;
	}

	function industryName(id: string): string {
		return data.industries.find((industry) => industry.id === id)?.name ?? id;
	}

	function featureName(id: string): string {
		return data.features.find((feature) => feature.id === id)?.name ?? id;
	}

	function modeLabel(mode: string): string {
		return OVERRIDE_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
	}

	// Each picker starts on the organization's current value, so there is
	// nothing to save until it is moved off it. Compared against the loaded
	// organization rather than the form's initial value, so a successful
	// change settles back to "nothing to save" when the load returns.
	let renamed = $derived($renameData.name.trim() !== data.organization.name);
	let tierChanged = $derived($tierData.tierId !== data.organization.tierId);
	let industryChanged = $derived($industryData.industryId !== data.organization.industryId);

	/**
	 * How many role assignments this organization holds. Roles are
	 * industry-scoped, so moving the organization to another vertical leaves
	 * every one of these pointing at the old vertical's roles, where they go
	 * inert instead of granting — the number is what makes that concrete
	 * before the move is posted.
	 */
	let roleAssignments = $derived(
		data.organization.members.reduce((total, member) => total + member.roles.length, 0)
	);
</script>

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Organization</Card.Title>
				<Card.Description>
					What this organization is on the platform. Its members and their roles stay the
					organization's own, from inside the app.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<dl class="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
					<dt class="text-muted-foreground">Identifier</dt>
					<dd class="font-mono text-xs break-all">{data.organization.id}</dd>

					<dt class="text-muted-foreground">Members</dt>
					<dd>{data.organization.memberCount}</dd>

					<dt class="text-muted-foreground">Created</dt>
					<dd>{mediumDate.format(new Date(data.organization.createdAt))}</dd>
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
				<Card.Title>Plan</Card.Title>
				<Card.Description>
					Moving an organization between plans changes which features it may use. It takes effect on
					this organization's next request.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<FormAlert message={$tierMessage} />
				<form method="POST" action="?/setTier" class="space-y-4" use:tierEnhance>
					<div class="space-y-2">
						<Label for="tierId">Plan</Label>
						<Combobox
							id="tierId"
							name="tierId"
							bind:value={$tierData.tierId}
							options={planOptions}
							invalid={Boolean($tierErrors.tierId)}
							class="w-full"
						/>
						{#if $tierErrors.tierId}
							<p class="text-destructive text-sm">{$tierErrors.tierId}</p>
						{/if}
					</div>
					<Button type="submit" disabled={!tierChanged || $movingTier}>
						{$movingTier ? 'Saving…' : 'Change plan'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Vertical</Card.Title>
			<Card.Description>
				The industry decides which features exist for this organization at all, what they are
				called, what order they sit in, and which roles it may hand out.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Alert.Root>
				<TriangleAlertIcon class="size-4" />
				<Alert.Title>Moving vertical re-resolves this organization</Alert.Title>
				<Alert.Description>
					Roles are scoped to an industry, so this organization's
					{roleAssignments === 1 ? '1 role assignment' : `${roleAssignments} role assignments`}
					would point at {data.organization.industryName}'s roles and stop granting. Owners and
					admins keep their access, so nobody is locked out. Features and names re-resolve on the
					organization's next request.
				</Alert.Description>
			</Alert.Root>

			<FormAlert message={$industryMessage} />
			<form method="POST" action="?/setIndustry" class="space-y-4" use:industryEnhance>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="industryId">Industry</Label>
						<Combobox
							id="industryId"
							name="industryId"
							bind:value={$industryData.industryId}
							options={industryOptions}
							invalid={Boolean($industryErrors.industryId)}
							class="w-full"
						/>
						{#if $industryErrors.industryId}
							<p class="text-destructive text-sm">{$industryErrors.industryId}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="confirm">Type “{data.organization.name}” to confirm</Label>
						<Input
							id="confirm"
							name="confirm"
							autocomplete="off"
							placeholder={data.organization.name}
							bind:value={$industryData.confirm}
							aria-invalid={Boolean($industryErrors.confirm)}
						/>
						{#if $industryErrors.confirm}
							<p class="text-destructive text-sm">{$industryErrors.confirm}</p>
						{/if}
					</div>
				</div>
				<Button type="submit" variant="destructive" disabled={!industryChanged || $movingIndustry}>
					{$movingIndustry ? 'Moving…' : 'Change vertical'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Feature overrides</Card.Title>
			<Card.Description>
				The per-organization escape hatch: a mode forced onto one feature, winning over both the
				plan and the vertical. Setting a mode on a feature that already has one replaces it.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6">
			{#if data.organization.overrides.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No overrides</Empty.Title>
						<Empty.Description>
							This organization sees exactly what {data.organization.tierName} and {data
								.organization.industryName} give it.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<FormAlert message={$clearMessage} />
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Feature</Table.Head>
							<Table.Head>Mode</Table.Head>
							<Table.Head>Note</Table.Head>
							<Table.Head class="w-0"><span class="sr-only">Clear</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.organization.overrides as override (override.featureId)}
							<Table.Row>
								<Table.Cell>
									{featureName(override.featureId)}
									<span class="text-muted-foreground text-xs">({override.featureId})</span>
								</Table.Cell>
								<Table.Cell><Badge variant="outline">{modeLabel(override.mode)}</Badge></Table.Cell>
								<Table.Cell class="text-muted-foreground">{override.note ?? '—'}</Table.Cell>
								<Table.Cell>
									<form method="POST" action="?/clearOverride" use:clearEnhance>
										<input type="hidden" name="featureId" value={override.featureId} />
										<Button
											type="submit"
											variant="ghost"
											size="sm"
											disabled={$clearing}
											aria-label="Clear the {featureName(override.featureId)} override"
										>
											Clear
										</Button>
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}

			<FormAlert message={$overrideMessage} />
			<form method="POST" action="?/setOverride" class="space-y-4" use:overrideEnhance>
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2">
						<Label for="featureId">Feature</Label>
						<Combobox
							id="featureId"
							name="featureId"
							bind:value={$overrideData.featureId}
							options={featureOptions}
							invalid={Boolean($overrideErrors.featureId)}
							class="w-full"
						/>
						{#if $overrideErrors.featureId}
							<p class="text-destructive text-sm">{$overrideErrors.featureId}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="mode">Mode</Label>
						<Combobox
							id="mode"
							name="mode"
							bind:value={$overrideData.mode}
							options={OVERRIDE_MODE_OPTIONS.map((option) => ({
								value: option.value,
								label: option.label,
								hint: option.hint
							}))}
							invalid={Boolean($overrideErrors.mode)}
							class="w-full"
						/>
						{#if $overrideErrors.mode}
							<p class="text-destructive text-sm">{$overrideErrors.mode}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="note">Note</Label>
						<Input
							id="note"
							name="note"
							placeholder="Pilot until Q3"
							bind:value={$overrideData.note}
							aria-invalid={Boolean($overrideErrors.note)}
						/>
						{#if $overrideErrors.note}
							<p class="text-destructive text-sm">{$overrideErrors.note}</p>
						{/if}
					</div>
				</div>
				<Button type="submit" disabled={$savingOverride}>
					{$savingOverride ? 'Saving…' : 'Apply override'}
				</Button>
			</form>

			{#if data.organization.disabledFeatures.length > 0}
				<section class="space-y-2">
					<h2 class="text-sm font-medium">Switched off by the organization</h2>
					<p class="text-muted-foreground text-sm">
						The organization's own opt-outs, made at its feature settings. Not an operator's to
						change — an override cannot say “disabled” for this reason.
					</p>
					<ul class="flex flex-wrap gap-2">
						{#each data.organization.disabledFeatures as featureId (featureId)}
							{@const Icon = iconFor(data.features.find((f) => f.id === featureId)?.icon ?? null)}
							<li>
								<Badge variant="secondary">
									<Icon class="size-3" />
									{featureName(featureId)}
								</Badge>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Members</Card.Title>
			<Card.Description>
				Who works in this organization, and what they hold. Changing any of it is the organization's
				own business, from its staff page.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Email</Table.Head>
						<Table.Head>Organization role</Table.Head>
						<Table.Head>Roles</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.organization.members as member (member.userId)}
						<Table.Row>
							<Table.Cell>{member.displayName ?? '—'}</Table.Cell>
							<Table.Cell>{member.email ?? '—'}</Table.Cell>
							<Table.Cell>{member.role}</Table.Cell>
							<Table.Cell>
								{#if member.roles.length === 0}
									<span class="text-muted-foreground">—</span>
								{:else}
									<span class="flex flex-wrap gap-1">
										{#each member.roles as role (role.id)}
											<Badge variant="secondary">{role.name}</Badge>
										{/each}
									</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
