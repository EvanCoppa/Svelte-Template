<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data, form } = $props();

	let submitting = $state(false);
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
				<FormAlert variant="success" message="Password updated. Sign in with your new password." />
			{/if}
			<FormAlert message={data.errorMessage} />
			<FormAlert message={form?.message} variant={form?.resetOk ? 'success' : 'destructive'} />

			<form
				method="POST"
				action="?/login"
				class="grid gap-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<!-- Round-trips the ?next= destination through the login POST. -->
				<input type="hidden" name="next" value={data.next} />

				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						placeholder="you@example.com"
						value={form?.email ?? ''}
						required
					/>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between">
						<Label for="password">Password</Label>
						<!--
							A second submit button in the same form: the reset action gets
							whatever email is typed, without needing a separate page.
							`formnovalidate` skips the required password check.
						-->
						<button
							type="submit"
							formaction="?/reset"
							formnovalidate
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
						required
					/>
				</div>
				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Signing in…' : 'Sign in'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
