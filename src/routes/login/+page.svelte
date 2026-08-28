<script lang="ts">
	import { enhance } from '$app/forms';
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
			{#if form?.message}
				<p
					class={[
						'mb-4 rounded-md border px-3 py-2 text-sm',
						form.resetOk
							? 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400'
							: 'border-destructive/30 bg-destructive/10 text-destructive'
					]}
				>
					{form.message}
				</p>
			{/if}

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
