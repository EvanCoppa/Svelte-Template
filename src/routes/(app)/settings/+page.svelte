<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { form } = $props();

	let user = $derived(page.data.user);
	let submitting = $state(false);
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
				A form action posting to <code>?/changePassword</code> — the template's default pattern for mutations.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if form?.changed}
				<p
					class="mb-4 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400"
				>
					Password updated.
				</p>
			{/if}
			{#if form?.message}
				<p
					class="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm"
				>
					{form.message}
				</p>
			{/if}
			<form
				method="POST"
				action="?/changePassword"
				class="grid max-w-sm gap-4"
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
						type="password"
						autocomplete="new-password"
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="confirm_password">Confirm password</Label>
					<Input
						id="confirm_password"
						name="confirm_password"
						type="password"
						autocomplete="new-password"
						required
					/>
				</div>
				<Button type="submit" class="w-fit" disabled={submitting}>
					{submitting ? 'Saving…' : 'Update password'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
