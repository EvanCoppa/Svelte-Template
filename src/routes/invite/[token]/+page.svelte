<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { data } = $props();

	// No fields of its own — the token lives in the URL — so there are no
	// client validators to run; the server resolves the token on submit.
	const { message, submitting, enhance } = superForm(data.form);

	let invite = $derived(data.invite);

	const TITLES = {
		ok: 'Join the team',
		invalid: 'Invitation not found',
		expired: 'Invitation expired',
		wrong_email: 'Wrong account',
		already_member: "You're already a member"
	} as const;
</script>

<svelte:head>
	<title>{TITLES[invite.status]}</title>
</svelte:head>

<div class="bg-muted/40 flex min-h-svh items-center justify-center p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="space-y-1">
			<Card.Title class="text-2xl">{TITLES[invite.status]}</Card.Title>
			<Card.Description>
				{#if invite.status === 'ok'}
					You've been invited to join <strong>{invite.orgName}</strong>.
				{:else if invite.status === 'already_member'}
					You already belong to <strong>{invite.orgName}</strong>.
				{:else if invite.status === 'expired'}
					This invitation to {invite.orgName} has expired. Ask whoever invited you for a new one.
				{:else if invite.status === 'wrong_email'}
					This invitation to {invite.orgName} was sent to a different email address. Sign in with that
					account to accept it.
				{:else}
					This invitation link is not valid. It may have been revoked or already used.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<FormAlert message={$message} />

			{#if invite.status === 'ok' || invite.status === 'already_member'}
				<form method="POST" action="?/accept" use:enhance>
					<Button type="submit" class="w-full" disabled={$submitting}>
						{#if invite.status === 'already_member'}
							{$submitting ? 'Opening…' : `Go to ${invite.orgName}`}
						{:else}
							{$submitting ? 'Joining…' : `Join ${invite.orgName}`}
						{/if}
					</Button>
				</form>
			{:else}
				<Button href="/" variant="outline" class="w-full">Back to the app</Button>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
