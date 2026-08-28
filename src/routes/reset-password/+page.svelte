<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data, form } = $props();

	let submitting = $state(false);
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
			{#if form?.message}
				<p
					class="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm"
				>
					{form.message}
				</p>
			{/if}

			<form
				method="POST"
				class="grid gap-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<div class="grid gap-2">
					<Label for="password">New password</Label>
					<Input
						id="password"
						name="password"
						type={inputType}
						autocomplete="new-password"
						minlength={data.minLength}
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="confirm_password">Confirm password</Label>
					<Input
						id="confirm_password"
						name="confirm_password"
						type={inputType}
						autocomplete="new-password"
						minlength={data.minLength}
						required
					/>
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="show-passwords" bind:checked={showPasswords} />
					<Label for="show-passwords" class="font-normal">Show passwords</Label>
				</div>
				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Saving…' : 'Set new password'}
				</Button>
			</form>

			<form method="POST" action="/logout" use:enhance class="mt-4 text-center">
				<button
					type="submit"
					class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
				>
					Back to sign in
				</button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
