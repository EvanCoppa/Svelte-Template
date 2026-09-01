<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import { UntitledButton } from '$lib/components/enhanced/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { newPasswordSchema } from '$lib/schemas/password';
	import { profileSchema } from './schema';

	let { data } = $props();

	let user = $derived(page.data.user);

	const {
		form: profileForm,
		errors: profileErrors,
		message: profileMessage,
		constraints: profileConstraints,
		submitting: savingProfile,
		enhance: profileEnhance
	} = superForm(data.profileForm, {
		validators: zod4Client(profileSchema),
		resetForm: false,
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (form.valid) toast.success('Profile updated');
		}
	});

	const {
		form: passwordForm,
		errors: passwordErrors,
		message: passwordMessage,
		constraints: passwordConstraints,
		submitting: savingPassword,
		enhance: passwordEnhance
	} = superForm(data.passwordForm, {
		validators: zod4Client(newPasswordSchema),
		onUpdated({ form }) {
			if (form.valid) toast.success('Password updated');
		}
	});
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your account.</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profile</Card.Title>
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
				<FormAlert message={$profileMessage} />
				<form method="POST" action="?/updateProfile" class="grid max-w-sm gap-4" use:profileEnhance>
					<div class="grid gap-2">
						<Label for="display_name">Display name</Label>
						<Input
							id="display_name"
							name="display_name"
							placeholder="How should we address you?"
							aria-invalid={$profileErrors.display_name ? 'true' : undefined}
							aria-describedby={$profileErrors.display_name ? 'display-name-error' : undefined}
							bind:value={$profileForm.display_name}
							{...$profileConstraints.display_name}
						/>
						{#if $profileErrors.display_name}
							<p id="display-name-error" class="text-destructive text-sm">
								{$profileErrors.display_name}
							</p>
						{/if}
					</div>
					<UntitledButton
						type="submit"
						class="w-fit"
						loading={$savingProfile}
						loadingLabel="Saving…"
					>
						Save profile
					</UntitledButton>
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

	<Card.Root>
		<Card.Header>
			<Card.Title>Change password</Card.Title>
			<Card.Description>
				A superforms action posting to <code>?/changePassword</code> — the template's default pattern
				for mutations.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<FormAlert message={$passwordMessage} />
			<form method="POST" action="?/changePassword" class="grid max-w-sm gap-4" use:passwordEnhance>
				<div class="grid gap-2">
					<Label for="password">New password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						aria-invalid={$passwordErrors.password ? 'true' : undefined}
						aria-describedby={$passwordErrors.password ? 'password-error' : undefined}
						bind:value={$passwordForm.password}
						{...$passwordConstraints.password}
					/>
					{#if $passwordErrors.password}
						<p id="password-error" class="text-destructive text-sm">{$passwordErrors.password}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="confirm_password">Confirm password</Label>
					<Input
						id="confirm_password"
						name="confirm_password"
						type="password"
						autocomplete="new-password"
						aria-invalid={$passwordErrors.confirm_password ? 'true' : undefined}
						aria-describedby={$passwordErrors.confirm_password
							? 'confirm-password-error'
							: undefined}
						bind:value={$passwordForm.confirm_password}
						{...$passwordConstraints.confirm_password}
					/>
					{#if $passwordErrors.confirm_password}
						<p id="confirm-password-error" class="text-destructive text-sm">
							{$passwordErrors.confirm_password}
						</p>
					{/if}
				</div>
				<UntitledButton
					type="submit"
					class="w-fit"
					loading={$savingPassword}
					loadingLabel="Saving…"
				>
					Update password
				</UntitledButton>
			</form>
		</Card.Content>
	</Card.Root>
</div>
