<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import XIcon from '@lucide/svelte/icons/x';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge, TagBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import type { FeatureMode } from '$lib/features/types';
	import { featuresSchema, isOverrideChoice, ORG_ROLES, planSchema } from './schema';

	let { data } = $props();

	type Member = (typeof data)['org']['members'][number];

	const industryOptions = $derived(
		data.industries.map(({ id, name }) => ({ value: id, label: name }))
	);
	const tierOptions = $derived(data.tiers.map(({ id, name }) => ({ value: id, label: name })));

	const OVERRIDE_OPTIONS: ComboboxOption[] = [
		{ value: 'inherit', label: 'Inherit', sublabel: 'Industry and plan decide' },
		{ value: 'enabled', label: 'Enabled', sublabel: 'Force on (a pilot)' },
		{ value: 'locked_visible', label: 'Locked', sublabel: 'Show with an upgrade prompt' },
		{ value: 'hidden', label: 'Hidden', sublabel: 'Does not exist for this org' }
	];
	const ORG_ROLE_OPTIONS = ORG_ROLES.map((role) => ({
		value: role,
		label: role[0].toUpperCase() + role.slice(1)
	}));

	/** How the resolved mode reads in the preview column. */
	const MODE_LABELS = {
		enabled: { label: 'Enabled', tone: 'success' },
		locked_visible: { label: 'Locked', tone: 'warning' },
		disabled: { label: 'Switched off', tone: 'neutral' },
		hidden: { label: 'Hidden', tone: 'error' }
	} satisfies Record<FeatureMode, { label: string; tone: BadgeTone }>;

	function memberName(member: Member): string {
		return member.displayName ?? member.email ?? 'Unnamed member';
	}

	/** Roles the org offers that this member does not already hold. */
	function roleOptions(member: Member): ComboboxOption[] {
		const held = new Set(member.roles.map((role) => role.id));
		return data.roles
			.filter((role) => !held.has(role.id))
			.map((role) => ({
				value: role.id,
				label: role.name,
				sublabel: role.description ?? undefined
			}));
	}

	/** Per-row picker state, keyed by member. */
	let orgRoleChoice = $state<Record<string, string>>({});
	let roleChoice = $state<Record<string, string>>({});

	const {
		form: plan,
		errors: planErrors,
		message: planMessage,
		submitting: savingPlan,
		enhance: planEnhance
	} = superForm(data.planForm, {
		id: 'plan',
		validators: zod4Client(planSchema),
		resetForm: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Plan saved');
		}
	});

	const {
		form: features,
		message: featuresMessage,
		submitting: savingFeatures,
		enhance: featuresEnhance
	} = superForm(data.featuresForm, {
		id: 'org-features',
		validators: zod4Client(featuresSchema),
		dataType: 'json',
		resetForm: false,
		onUpdated({ form }) {
			if (form.valid) toast.success('Features saved');
		}
	});

	// The three member forms post per-row values through hidden inputs and a
	// named combobox, so their stores never see what is submitted and the
	// server validates them instead (see /staff for the same shape).
	const {
		message: memberRoleMessage,
		submitting: savingMemberRole,
		enhance: memberRoleEnhance
	} = superForm(data.memberRoleForm, {
		id: 'member-role',
		onUpdated({ form }) {
			if (form.valid) toast.success('Role updated');
		}
	});
	const {
		message: assignMessage,
		submitting: assigning,
		enhance: assignEnhance
	} = superForm(data.assignForm, {
		id: 'assign-role',
		onUpdated({ form }) {
			if (form.valid) toast.success('Role assigned');
		}
	});
	const {
		message: unassignMessage,
		submitting: unassigning,
		enhance: unassignEnhance
	} = superForm(data.unassignForm, {
		id: 'unassign-role',
		onUpdated({ form }) {
			if (form.valid) toast.success('Role removed');
		}
	});

	function setOverride(index: number, value: string) {
		if (isOverrideChoice(value)) $features.overrides[index].mode = value;
	}

	function setDisabled(featureId: string, on: boolean) {
		const rest = $features.disabled.filter((id) => id !== featureId);
		$features.disabled = on ? [...rest, featureId] : rest;
	}
</script>

<svelte:head>
	<title>Admin · {data.org.name}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-xl font-semibold tracking-tight">{data.org.name}</h2>
	<Button href="/admin/organizations" variant="ghost" size="sm">All organizations</Button>
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>Industry and plan</Card.Title>
		<Card.Description>
			The industry decides which features exist and which roles can be handed out; the plan decides
			which of those features are unlocked.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$planMessage} />
		<form method="POST" action="?/savePlan" class="flex flex-wrap items-end gap-4" use:planEnhance>
			<div class="grid gap-2">
				<Label for="industry">Industry</Label>
				<Combobox
					id="industry"
					name="industry_id"
					class="w-56"
					options={industryOptions}
					value={$plan.industry_id}
					onchange={(value) => ($plan.industry_id = value)}
					invalid={Boolean($planErrors.industry_id)}
				/>
				{#if $planErrors.industry_id}
					<p class="text-destructive text-sm">{$planErrors.industry_id}</p>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="tier">Plan</Label>
				<Combobox
					id="tier"
					name="tier_id"
					class="w-56"
					options={tierOptions}
					value={$plan.tier_id}
					onchange={(value) => ($plan.tier_id = value)}
					invalid={Boolean($planErrors.tier_id)}
				/>
				{#if $planErrors.tier_id}
					<p class="text-destructive text-sm">{$planErrors.tier_id}</p>
				{/if}
			</div>
			<Button type="submit" disabled={$savingPlan}>
				{$savingPlan ? 'Saving…' : 'Save plan'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Features</Card.Title>
		<Card.Description>
			"Shows as" is what this organization's sidebar resolves to right now. An override wins over
			industry and plan; "switched off" is the org's own opt-out, which only matters for a feature
			that would otherwise be enabled.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$featuresMessage} />
		<form method="POST" action="?/saveFeatures" class="space-y-4" use:featuresEnhance>
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Feature</Table.Head>
							<Table.Head>Shows as</Table.Head>
							<Table.Head>Override</Table.Head>
							<Table.Head class="text-center">Switched off</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.registry as feature, i (feature.id)}
							{@const mode = data.modes[feature.id] ?? 'hidden'}
							<Table.Row>
								<Table.Cell class="font-medium">{feature.name}</Table.Cell>
								<Table.Cell>
									<StatusBadge tone={MODE_LABELS[mode].tone}>{MODE_LABELS[mode].label}</StatusBadge>
								</Table.Cell>
								<Table.Cell>
									<Combobox
										size="sm"
										class="w-40"
										options={OVERRIDE_OPTIONS}
										value={$features.overrides[i]?.mode ?? 'inherit'}
										onchange={(value) => setOverride(i, value)}
										ariaLabel="Override for {feature.name}"
									/>
								</Table.Cell>
								<Table.Cell class="text-center">
									<Checkbox
										checked={$features.disabled.includes(feature.id)}
										onCheckedChange={(on) => setDisabled(feature.id, on)}
										aria-label="{feature.name} switched off by the organization"
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<Button type="submit" disabled={$savingFeatures}>
				{$savingFeatures ? 'Saving…' : 'Save features'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Members</Card.Title>
		<Card.Description>
			Owners and admins hold every grant; a member sees only what their named roles grant.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$memberRoleMessage} />
		<FormAlert message={$assignMessage} />
		<FormAlert message={$unassignMessage} />
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Person</Table.Head>
						<Table.Head>Org role</Table.Head>
						<Table.Head>Named roles</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.org.members as member (member.userId)}
						{@const options = roleOptions(member)}
						<Table.Row>
							<Table.Cell class="align-top">
								<div class="font-medium">{memberName(member)}</div>
								{#if member.email}
									<div class="text-muted-foreground text-xs">{member.email}</div>
								{/if}
							</Table.Cell>
							<Table.Cell class="align-top">
								<form
									method="POST"
									action="?/setMemberRole"
									class="flex items-center gap-2"
									use:memberRoleEnhance
								>
									<input type="hidden" name="user_id" value={member.userId} />
									<Combobox
										name="role"
										size="sm"
										class="w-32"
										options={ORG_ROLE_OPTIONS}
										value={orgRoleChoice[member.userId] ?? member.role}
										onchange={(value) => (orgRoleChoice[member.userId] = value)}
										ariaLabel="Org role of {memberName(member)}"
									/>
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={$savingMemberRole ||
											(orgRoleChoice[member.userId] ?? member.role) === member.role}
									>
										Update
									</Button>
								</form>
							</Table.Cell>
							<Table.Cell class="align-top">
								<div class="flex flex-wrap gap-1">
									{#each member.roles as role (role.id)}
										<form method="POST" action="?/unassignRole" use:unassignEnhance>
											<input type="hidden" name="user_id" value={member.userId} />
											<input type="hidden" name="role_id" value={role.id} />
											<TagBadge tone="indigo" class="gap-1 pr-1">
												{role.name}
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-4 rounded-sm hover:bg-transparent hover:opacity-70"
													disabled={$unassigning}
													aria-label="Remove the {role.name} role from {memberName(member)}"
												>
													<XIcon class="size-3" />
												</Button>
											</TagBadge>
										</form>
									{:else}
										<span class="text-muted-foreground text-xs">No roles</span>
									{/each}
								</div>
								<form
									method="POST"
									action="?/assignRole"
									class="mt-2 flex items-center gap-2"
									use:assignEnhance
								>
									<input type="hidden" name="user_id" value={member.userId} />
									<Combobox
										name="role_id"
										size="sm"
										class="w-44"
										{options}
										value={roleChoice[member.userId] ?? ''}
										onchange={(value) => (roleChoice[member.userId] = value)}
										placeholder="Add a role…"
										emptyText="No roles left to add"
										disabled={options.length === 0}
										ariaLabel="Add a role for {memberName(member)}"
									/>
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={$assigning || !roleChoice[member.userId]}
									>
										Assign
									</Button>
								</form>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Content>
</Card.Root>
