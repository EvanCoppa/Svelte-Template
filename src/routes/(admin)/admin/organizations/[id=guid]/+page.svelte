<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { QUERY } from '$lib/queries';
	import { setTierSchema } from './schema';

	let { data } = $props();

	const mediumDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const { form, errors, message, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(setTierSchema),
		resetForm: false,
		invalidateAll: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			toast.success(`${data.organization.name} moved to ${planName(form.data.tierId)}`);
			invalidate(QUERY.adminOrganizations);
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

	function planName(id: string): string {
		return data.tiers.find((tier) => tier.id === id)?.name ?? id;
	}

	// The picker starts on the organization's current plan, so there is
	// nothing to save until it is moved off it. Compared against the loaded
	// organization rather than the form's initial value, so a successful
	// change settles back to "nothing to save" when the load returns.
	let changed = $derived($form.tierId !== data.organization.tierId);
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
					What this organization is on the platform. Its name, industry and members are the
					organization's own to change, from inside the app.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
					<dt class="text-muted-foreground">Identifier</dt>
					<dd class="font-mono text-xs break-all">{data.organization.id}</dd>

					<dt class="text-muted-foreground">Industry</dt>
					<dd>
						{data.organization.industryName}
						<span class="text-muted-foreground text-xs">({data.organization.industryId})</span>
					</dd>

					<dt class="text-muted-foreground">Plan</dt>
					<dd>
						{data.organization.tierName}
						<span class="text-muted-foreground text-xs">({data.organization.tierId})</span>
					</dd>

					<dt class="text-muted-foreground">Members</dt>
					<dd>{data.organization.memberCount}</dd>

					<dt class="text-muted-foreground">Created</dt>
					<dd>{mediumDate.format(new Date(data.organization.createdAt))}</dd>
				</dl>
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
				<FormAlert message={$message} />
				<form method="POST" action="?/setTier" class="space-y-4" use:enhance>
					<div class="space-y-2">
						<Label for="tierId">Plan</Label>
						<Combobox
							id="tierId"
							name="tierId"
							bind:value={$form.tierId}
							options={planOptions}
							invalid={Boolean($errors.tierId)}
							class="w-full"
						/>
						{#if $errors.tierId}
							<p class="text-destructive text-sm">{$errors.tierId}</p>
						{/if}
					</div>
					<Button type="submit" disabled={!changed || $submitting}>
						{$submitting ? 'Saving…' : 'Change plan'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

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

	<Card.Root>
		<Card.Header>
			<Card.Title>Feature exceptions</Card.Title>
			<Card.Description>
				Where this organization differs from what its plan and industry give it. Overrides are
				operator-owned (SQL or the service role); opt-outs are the organization's own, made at its
				feature settings.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6">
			{#if data.organization.overrides.length === 0 && data.organization.disabledFeatures.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No exceptions</Empty.Title>
						<Empty.Description>
							This organization sees exactly what {data.organization.tierName} and {data
								.organization.industryName} give it.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				{#if data.organization.overrides.length > 0}
					<section class="space-y-2">
						<h2 class="text-sm font-medium">Operator overrides</h2>
						<ul class="flex flex-wrap gap-2">
							{#each data.organization.overrides as override (override.featureId)}
								<li>
									<Badge variant="outline">{override.featureId} → {override.mode}</Badge>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
				{#if data.organization.disabledFeatures.length > 0}
					<section class="space-y-2">
						<h2 class="text-sm font-medium">Switched off by the organization</h2>
						<ul class="flex flex-wrap gap-2">
							{#each data.organization.disabledFeatures as featureId (featureId)}
								<li><Badge variant="secondary">{featureId}</Badge></li>
							{/each}
						</ul>
					</section>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
