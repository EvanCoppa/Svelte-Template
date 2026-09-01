<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { enhance as kitEnhance } from '$app/forms';
	import { UntitledButton } from '$lib/components/enhanced/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { newPasswordSchema } from '$lib/schemas/password';

	let { data } = $props();

	const { form, errors, message, constraints, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(newPasswordSchema)
	});

	let showPasswords = $state(false);
	let inputType = $derived(showPasswords ? 'text' : 'password');
</script>

<svelte:head>
	<title>Choose a new password</title>
</svelte:head>

<div class="bg-muted/40 flex min-h-svh items-center justify-center p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="space-y-1">
			<Card.Title class="text-2xl">Choose a new password</Card.Title>
			<Card.Description>
				{#if data.email}
					Resetting the password for <span class="text-foreground font-medium">{data.email}</span>.
				{:else}
					Pick a new password to finish signing in.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<FormAlert message={$message} />

			<form method="POST" class="grid gap-4" use:enhance>
				<div class="grid gap-2">
					<Label for="password">New password</Label>
					<Input
						id="password"
						name="password"
						type={inputType}
						autocomplete="new-password"
						aria-invalid={$errors.password ? 'true' : undefined}
						aria-describedby={$errors.password ? 'password-error' : undefined}
						bind:value={$form.password}
						{...$constraints.password}
					/>
					{#if $errors.password}
						<p id="password-error" class="text-destructive text-sm">{$errors.password}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="confirm_password">Confirm password</Label>
					<Input
						id="confirm_password"
						name="confirm_password"
						type={inputType}
						autocomplete="new-password"
						aria-invalid={$errors.confirm_password ? 'true' : undefined}
						aria-describedby={$errors.confirm_password ? 'confirm-password-error' : undefined}
						bind:value={$form.confirm_password}
						{...$constraints.confirm_password}
					/>
					{#if $errors.confirm_password}
						<p id="confirm-password-error" class="text-destructive text-sm">
							{$errors.confirm_password}
						</p>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="show-passwords" bind:checked={showPasswords} />
					<Label for="show-passwords" class="font-normal">Show passwords</Label>
				</div>
				<UntitledButton type="submit" class="w-full" loading={$submitting} loadingLabel="Saving…">
					Set new password
				</UntitledButton>
			</form>

			<form method="POST" action="/logout" use:kitEnhance class="mt-4 text-center">
				<UntitledButton type="submit" color="link-gray">Back to sign in</UntitledButton>
			</form>
		</Card.Content>
	</Card.Root>
</div>
