<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import LockIcon from '@lucide/svelte/icons/lock';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { iconFor } from '$lib/features/icons';
	import { NAV_CATEGORIES } from '$lib/navigation';
	import { showUpgrade } from '$lib/upgrade.svelte';
	import { featuresSchema } from './schema';

	let { data } = $props();

	const { form, message, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(featuresSchema),
		resetForm: false,
		dataType: 'json',
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Features updated');
		}
	});

	let groups = $derived(
		NAV_CATEGORIES.map((category) => ({
			...category,
			rows: data.rows.filter((row) => row.category === category.key)
		})).filter((group) => group.rows.length > 0)
	);

	let highlighted = $derived(data.rows.find((row) => row.id === data.highlight) ?? null);

	function setEnabled(id: string, on: boolean) {
		const rest = $form.enabled.filter((x) => x !== id);
		$form.enabled = on ? [...rest, id] : rest;
	}
</script>

<svelte:head>
	<title>Features</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Features</h1>
		<p class="text-muted-foreground">
			Choose what your organization uses. Features outside your plan show an upgrade prompt;
			anything not listed is not part of your industry.
		</p>
	</div>

	{#if highlighted && highlighted.mode === 'disabled'}
		<Alert.Root>
			<LockIcon class="size-4" />
			<Alert.Title>{highlighted.name} is turned off for this organization</Alert.Title>
			<Alert.Description>
				{#if data.canManage}
					Switch it on below to use it again.
				{:else}
					An owner or admin can switch it back on here.
				{/if}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<FormAlert message={$message} />
	<form method="POST" action="?/save" class="space-y-6" use:enhance>
		{#each groups as group (group.key)}
			<Card.Root>
				<Card.Header>
					<Card.Title>{group.label}</Card.Title>
				</Card.Header>
				<Card.Content class="divide-y">
					{#each group.rows as row (row.id)}
						{@const Icon = iconFor(row.icon)}
						{@const locked = row.mode === 'locked_visible'}
						<div
							class={[
								'flex items-center gap-4 py-3 first:pt-0 last:pb-0',
								row.id === data.highlight && 'bg-muted/50 -mx-2 rounded-md px-2'
							]}
						>
							<Icon class={locked ? 'text-muted-foreground size-5 shrink-0' : 'size-5 shrink-0'} />
							<div class="min-w-0 flex-1">
								<Label
									for={`feature-${row.id}`}
									class={locked ? 'text-muted-foreground' : undefined}
								>
									{row.name}
								</Label>
								{#if row.description}
									<p class="text-muted-foreground text-sm">{row.description}</p>
								{/if}
							</div>
							{#if locked}
								<Button variant="outline" size="sm" onclick={() => showUpgrade(row.id)}>
									<LockIcon class="size-3.5" />
									Upgrade
								</Button>
							{:else}
								<Switch
									id={`feature-${row.id}`}
									checked={$form.enabled.includes(row.id)}
									onCheckedChange={(on) => setEnabled(row.id, on)}
									disabled={!data.canManage || $submitting}
								/>
							{/if}
						</div>
					{/each}
				</Card.Content>
			</Card.Root>
		{/each}

		{#if data.canManage}
			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Saving…' : 'Save changes'}
			</Button>
		{:else}
			<p class="text-muted-foreground text-sm">Only owners and admins can change these.</p>
		{/if}
	</form>
</div>
