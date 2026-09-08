<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { newPasswordSchema } from '$lib/schemas/password';

	let { data } = $props();

	const { form, errors, message, constraints, submitting, enhance } = superForm(data.passwordForm, {
		validators: zod4Client(newPasswordSchema),
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Password updated');
		}
	});
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Security</h1>
		<p class="text-muted-foreground">How you sign in to this account.</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Change password</Card.Title>
			<Card.Description>
				A superforms action posting to <code>?/changePassword</code> — the template's default pattern
				for mutations.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<FormAlert message={$message} />
			<form method="POST" action="?/changePassword" class="grid max-w-sm gap-4" use:enhance>
				<div class="grid gap-2">
					<Label for="password">New password</Label>
					<Input
						id="password"
						name="password"
						type="password"
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
						type="password"
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
				<Button type="submit" class="w-fit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Update password'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
