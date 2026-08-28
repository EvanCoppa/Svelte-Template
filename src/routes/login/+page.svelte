<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { loginSchema } from './schema';

	let { data } = $props();

	const { form, errors, message, constraints, submitting, enhance } = superForm(data.loginForm, {
		validators: zod4Client(loginSchema)
	});

	// The reset form has no visible inputs of its own — it posts whatever email
	// is typed into the login form via a hidden mirror input, so its store never
	// sees the value and client-side validators would misfire. The server
	// validates it instead.
	const {
		errors: resetErrors,
		message: resetMessage,
		submitting: resetSubmitting,
		enhance: resetEnhance
	} = superForm(data.resetForm);
</script>

<svelte:head>
	<title>Sign in</title>
</svelte:head>

<div class="bg-muted/40 flex min-h-svh items-center justify-center p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="space-y-1">
			<Card.Title class="text-2xl">Sign in</Card.Title>
			<Card.Description>Enter your email and password to continue.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.passwordReset}
				<p
					class="mb-4 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400"
				>
					Password updated. Sign in with your new password.
				</p>
			{/if}
			{#if data.errorMessage}
				<p
					class="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm"
				>
					{data.errorMessage}
				</p>
			{/if}
			{#if $message}
				<p
					class="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm"
				>
					{$message}
				</p>
			{/if}
			{#if $resetMessage}
				<p
					class="mb-4 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400"
				>
					{$resetMessage}
				</p>
			{/if}
			{#if $resetErrors.email}
				<p
					class="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm"
				>
					{$resetErrors.email}
				</p>
			{/if}

			<form method="POST" action="?/login" class="grid gap-4" use:enhance>
				<!-- Round-trips the ?next= destination through the login POST. -->
				<input type="hidden" name="next" value={$form.next} />

				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						placeholder="you@example.com"
						aria-invalid={$errors.email ? 'true' : undefined}
						bind:value={$form.email}
						{...$constraints.email}
					/>
					{#if $errors.email}
						<p class="text-destructive text-sm">{$errors.email}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between">
						<Label for="password">Password</Label>
						<!--
							Submits the sibling reset form (via the form attribute), so the
							reset action gets whatever email is typed without a separate page.
						-->
						<button
							type="submit"
							form="reset-form"
							disabled={$resetSubmitting}
							class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
						>
							Forgot password?
						</button>
					</div>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						aria-invalid={$errors.password ? 'true' : undefined}
						bind:value={$form.password}
						{...$constraints.password}
					/>
					{#if $errors.password}
						<p class="text-destructive text-sm">{$errors.password}</p>
					{/if}
				</div>
				<Button type="submit" class="w-full" disabled={$submitting}>
					{$submitting ? 'Signing in…' : 'Sign in'}
				</Button>
			</form>

			<!-- Mirrors the typed email into the ?/reset action; see the note above. -->
			<form id="reset-form" method="POST" action="?/reset" class="hidden" use:resetEnhance>
				<input type="hidden" name="email" value={$form.email} />
			</form>
		</Card.Content>
	</Card.Root>
</div>
