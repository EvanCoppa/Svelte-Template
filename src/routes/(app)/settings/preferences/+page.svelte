<script lang="ts">
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import UserIcon from '@lucide/svelte/icons/circle-user';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { QUERY } from '$lib/queries';
	import { theme } from '$lib/theme.svelte';
	import { preferencesSchema } from './schema';

	/**
	 * Both axes of a user's settings, side by side and labelled, because which
	 * one a switch is on is the whole distinction (docs/user-preferences.md):
	 * what follows you to another computer, and what stays on this one.
	 */
	let { data } = $props();

	const { form, message, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(preferencesSchema),
		resetForm: false,
		dataType: 'json',
		onUpdated({ form: result }) {
			if (!result.valid) return;
			toast.success('Preferences saved');
			// The shell reads these too — the notes rail is drawn from them.
			invalidate(QUERY.preferences);
		}
	});

	/** The posted value for a switch, which the registry says is a boolean. */
	function switched(key: string): boolean {
		return $form.values[key] === true;
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
	</PageHeader.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<LaptopIcon class="size-4" />
				On this device
			</Card.Title>
			<Card.Description>
				Kept in this browser, on this computer. Signing in somewhere else starts from that machine's
				own settings.
			</Card.Description>
		</Card.Header>
		<Card.Content class="divide-y">
			<div class="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
				<MoonIcon class="size-5 shrink-0" />
				<div class="min-w-0 flex-1">
					<Label for="preference-theme">Dark theme</Label>
					<p class="text-muted-foreground text-sm">
						Follows this computer's own light or dark setting until you pick one here.
					</p>
				</div>
				<Switch
					id="preference-theme"
					checked={theme.current === 'dark'}
					onCheckedChange={() => theme.toggle()}
				/>
			</div>
		</Card.Content>
	</Card.Root>

	<FormAlert message={$message} />

	<form method="POST" action="?/save" class="space-y-6" use:enhance>
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<UserIcon class="size-4" />
					Your account
				</Card.Title>
				<Card.Description>
					Saved to your account, so they follow you to any browser you sign in from.
				</Card.Description>
			</Card.Header>
			<Card.Content class="divide-y">
				{#each data.rows as row (row.key)}
					<div class="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
						<div class="min-w-0 flex-1">
							<Label for={`preference-${row.key}`}>{row.label}</Label>
							<p class="text-muted-foreground text-sm">{row.description}</p>
						</div>
						<!-- Drawn by the kind the registry declares, never by looking at
						     the value: a select or a text preference adds a branch here. -->
						{#if row.kind === 'switch'}
							<Switch
								id={`preference-${row.key}`}
								checked={switched(row.key)}
								onCheckedChange={(on) => ($form.values[row.key] = on)}
								disabled={$submitting}
							/>
						{/if}
					</div>
				{/each}

				{#if data.rows.length === 0}
					<p class="text-muted-foreground text-sm">
						Nothing to set yet. Preferences appear here as the features they belong to are turned on
						for this organization.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if data.rows.length > 0}
			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Saving…' : 'Save preferences'}
			</Button>
		{/if}
	</form>
</div>
