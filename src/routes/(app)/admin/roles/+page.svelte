<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { HoldToConfirm } from '$lib/components/enhanced/index.js';
	import { createRoleSchema, grantsSchema, isGrantLevel } from './schema';

	let { data } = $props();

	const industryOptions = $derived(
		data.industries.map(({ id, name }) => ({ value: id, label: name }))
	);

	const LEVEL_OPTIONS = [
		{ value: 'none', label: '—', sublabel: 'No access' },
		{ value: 'read', label: 'Read', sublabel: 'Sees the page' },
		{ value: 'manage', label: 'Manage', sublabel: 'Adds and edits' },
		{ value: 'delete', label: 'Delete', sublabel: 'Removes, too' }
	];

	/** The delete forms, so a hold button can submit the row it belongs to. */
	const deleteForms: Record<string, HTMLFormElement | null> = {};

	const {
		form: grants,
		message: grantsMessage,
		submitting: savingGrants,
		enhance: grantsEnhance
	} = superForm(data.grantsForm, {
		id: 'grants',
		validators: zod4Client(grantsSchema),
		dataType: 'json',
		resetForm: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Grants saved');
		}
	});

	const {
		form: newRole,
		errors: newRoleErrors,
		message: newRoleMessage,
		constraints: newRoleConstraints,
		submitting: creating,
		enhance: createEnhance
	} = superForm(data.createRoleForm, {
		id: 'create-role',
		validators: zod4Client(createRoleSchema),
		onUpdated({ form }) {
			if (form.valid) toast.success('Role created');
		}
	});

	// Id-only, posted through a hidden input, so the server validates it
	// (client validators would never see the value — see /staff).
	const {
		message: deleteMessage,
		submitting: deleting,
		enhance: deleteEnhance
	} = superForm(data.deleteRoleForm, {
		id: 'delete-role',
		onUpdated({ form }) {
			if (form.valid) toast.success('Role deleted');
		}
	});

	/** Cells are laid out role-major by the load: role index × features + feature index. */
	function cellIndex(roleIndex: number, featureIndex: number): number {
		return roleIndex * data.registry.length + featureIndex;
	}

	function setLevel(index: number, value: string) {
		if (isGrantLevel(value)) $grants.grants[index].level = value;
	}

	function switchIndustry(id: string) {
		goto(`/admin/roles?industry=${encodeURIComponent(id)}`);
	}
</script>

<svelte:head>
	<title>Admin · Roles</title>
</svelte:head>

<div class="flex flex-wrap items-center gap-3">
	<Label for="industry">Industry</Label>
	<Combobox
		id="industry"
		class="w-56"
		options={industryOptions}
		value={data.industry.id}
		onchange={switchIndustry}
	/>
	<p class="text-muted-foreground text-sm">
		Roles are scoped to an industry; every organization in it shares this set.
	</p>
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>Grants in {data.industry.name}</Card.Title>
		<Card.Description>
			What each role lets a member do on each feature. Levels are a ladder — manage implies read,
			delete implies both — and owners and admins hold everything regardless.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$grantsMessage} />
		<FormAlert message={$deleteMessage} />
		{#if data.roles.length === 0}
			<p class="text-muted-foreground text-sm">No roles yet — create one below.</p>
		{:else}
			<form method="POST" action="?/saveGrants" class="space-y-4" use:grantsEnhance>
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Feature</Table.Head>
								{#each data.roles as role (role.id)}
									<Table.Head class="min-w-40">
										<div class="flex items-center justify-between gap-2">
											<div class="leading-tight">
												<div>{role.name}</div>
												{#if role.description}
													<div class="text-muted-foreground text-xs font-normal">
														{role.description}
													</div>
												{/if}
											</div>
										</div>
									</Table.Head>
								{/each}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.registry as feature, featureIndex (feature.id)}
								<Table.Row>
									<Table.Cell class="font-medium">{feature.name}</Table.Cell>
									{#each data.roles as role, roleIndex (role.id)}
										{@const index = cellIndex(roleIndex, featureIndex)}
										<Table.Cell>
											<Combobox
												size="sm"
												class="w-32"
												options={LEVEL_OPTIONS}
												value={$grants.grants[index]?.level ?? 'none'}
												onchange={(value) => setLevel(index, value)}
												ariaLabel="{role.name} on {feature.name}"
											/>
										</Table.Cell>
									{/each}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
				<Button type="submit" disabled={$savingGrants}>
					{$savingGrants ? 'Saving…' : 'Save grants'}
				</Button>
			</form>

			<div class="mt-6 flex flex-wrap gap-2">
				{#each data.roles as role (role.id)}
					<form
						method="POST"
						action="?/deleteRole"
						bind:this={deleteForms[role.id]}
						use:deleteEnhance
					>
						<input type="hidden" name="role_id" value={role.id} />
						<HoldToConfirm
							class="h-8 px-3"
							confirmLabel="Deleted"
							disabled={$deleting}
							onConfirm={() => deleteForms[role.id]?.requestSubmit()}
						>
							Hold to delete {role.name}
						</HoldToConfirm>
					</form>
				{/each}
			</div>
			<p class="text-muted-foreground mt-2 text-xs">
				Deleting a role removes its grants and unassigns it from every member.
			</p>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>New role in {data.industry.name}</Card.Title>
	</Card.Header>
	<Card.Content>
		<FormAlert message={$newRoleMessage} />
		<form method="POST" action="?/createRole" class="grid gap-4 sm:grid-cols-2" use:createEnhance>
			<input type="hidden" name="industry_id" value={$newRole.industry_id} />
			<div class="grid gap-2">
				<Label for="role-name">Name</Label>
				<Input
					id="role-name"
					name="name"
					aria-invalid={$newRoleErrors.name ? 'true' : undefined}
					bind:value={$newRole.name}
					{...$newRoleConstraints.name}
				/>
				{#if $newRoleErrors.name}
					<p class="text-destructive text-sm">{$newRoleErrors.name}</p>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="role-description">Description</Label>
				<Input
					id="role-description"
					name="description"
					aria-invalid={$newRoleErrors.description ? 'true' : undefined}
					bind:value={$newRole.description}
					{...$newRoleConstraints.description}
				/>
				{#if $newRoleErrors.description}
					<p class="text-destructive text-sm">{$newRoleErrors.description}</p>
				{/if}
			</div>
			<div class="sm:col-span-2">
				<Button type="submit" disabled={$creating}>
					{$creating ? 'Creating…' : 'Create role'}
				</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>
