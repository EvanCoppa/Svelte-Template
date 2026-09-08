<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { profileSchema } from './schema';

	let { data } = $props();

	let user = $derived(page.data.user);

	const { form, errors, message, constraints, submitting, enhance } = superForm(data.profileForm, {
		validators: zod4Client(profileSchema),
		resetForm: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Profile updated');
		}
	});
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader.Root>
		<PageHeader.Title>Profile</PageHeader.Title>
	</PageHeader.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Display name</Card.Title>
			<Card.Description>
				A typed query against the <code>profiles</code> table from the starter migration — load + form
				action + RLS end to end.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.profile === null}
				<p class="text-muted-foreground text-sm">
					No profile row found. Apply the starter migration in
					<code>supabase/migrations/</code> (see the README), then reload.
				</p>
			{:else}
				<FormAlert message={$message} />
				<form method="POST" action="?/updateProfile" class="grid max-w-sm gap-4" use:enhance>
					<div class="grid gap-2">
						<Label for="display_name">Display name</Label>
						<Input
							id="display_name"
							name="display_name"
							placeholder="How should we address you?"
							aria-invalid={$errors.display_name ? 'true' : undefined}
							aria-describedby={$errors.display_name ? 'display-name-error' : undefined}
							bind:value={$form.display_name}
							{...$constraints.display_name}
						/>
						{#if $errors.display_name}
							<p id="display-name-error" class="text-destructive text-sm">
								{$errors.display_name}
							</p>
						{/if}
					</div>
					<Button type="submit" class="w-fit" disabled={$submitting}>
						{$submitting ? 'Saving…' : 'Save profile'}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Account</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-2 text-sm">
			<div class="flex justify-between gap-4">
				<span class="text-muted-foreground">Email</span>
				<span class="font-medium">{user?.email}</span>
			</div>
			<div class="flex justify-between gap-4">
				<span class="text-muted-foreground">User ID</span>
				<span class="font-mono text-xs">{user?.id}</span>
			</div>
		</Card.Content>
	</Card.Root>
</div>
