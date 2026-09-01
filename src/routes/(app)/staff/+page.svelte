<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import LinkIcon from '@lucide/svelte/icons/link';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { StatusBadge, TagBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { CopyButton, HoldToConfirm } from '$lib/components/enhanced/index.js';
	import { inviteSchema } from './schema';

	let { data } = $props();

	type Member = (typeof data)['staff'][number];

	let user = $derived(page.data.user);
	let activeOrg = $derived(page.data.activeOrg);

	/** Org role is a rank, not a status: three fixed tones, one per rank. */
	const ORG_ROLE_TONES = {
		owner: 'violet',
		admin: 'info',
		member: 'neutral'
	} satisfies Record<Member['role'], BadgeTone>;

	// A fixed locale keeps the server render and the hydrated render identical;
	// the visitor's own locale would differ from the server's and flag a mismatch.
	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	function formatDate(value: string): string {
		return dateFormat.format(new Date(value));
	}

	function memberName(member: Member): string {
		return member.displayName ?? member.email ?? 'Unnamed member';
	}

	function initials(member: Member): string {
		const words = memberName(member)
			.split(/[\s@._-]+/)
			.filter(Boolean);
		if (words.length === 0) return '?';
		if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	}

	/** Roles the org offers that this member does not already hold. */
	function roleOptions(member: Member): ComboboxOption[] {
		const held = new Set(member.roles.map((role) => role.id));
		return data.roles
			.filter((role) => !held.has(role.id))
			.map((role) => ({
				value: role.id,
				label: role.name,
				sublabel: role.description ?? undefined
			}));
	}

	/** Which role each row's picker has selected, keyed by member. */
	let roleChoice = $state<Record<string, string>>({});
	/**
	 * The remove forms, so the hold button can submit the row it belongs to —
	 * HoldToConfirm is a `type="button"` control, it never submits on its own.
	 */
	const removeForms: Record<string, HTMLFormElement | null> = {};

	let inviteOpen = $state(false);

	const {
		form: inviteFormData,
		errors: inviteErrors,
		message: inviteMessage,
		constraints: inviteConstraints,
		submitting: inviting,
		enhance: inviteEnhance
	} = superForm(data.inviteForm, {
		id: 'invite',
		validators: zod4Client(inviteSchema),
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			inviteOpen = false;
			toast.success('Invite sent');
		}
	});

	/**
	 * The five id-only forms below post per-row values through hidden inputs, so
	 * their stores never see what is submitted and client validators would
	 * misfire — the server validates them instead (same shape as the hidden
	 * reset form on /login).
	 *
	 * They also carry explicit ids: superforms derives a form id from the schema
	 * shape, and assignRole/unassignRole are the same shape, so without these two
	 * instances would answer to each other's results. Every id here is mirrored
	 * in the matching `superValidate` call in `+page.server.ts` (FORM_IDS), which
	 * is what keeps the no-JS path routing to the form that was submitted.
	 */
	const {
		message: linkMessage,
		submitting: creatingLink,
		enhance: linkEnhance
	} = superForm(data.inviteLinkForm, {
		id: 'invite-link',
		onUpdated({ form }) {
			if (form.valid) toast.success('Invite link created — copy it from the pending list.');
		}
	});

	const {
		message: assignMessage,
		submitting: assigning,
		enhance: assignEnhance
	} = superForm(data.assignForm, {
		id: 'assign-role',
		onUpdated({ form }) {
			if (!form.valid) return;
			roleChoice = {};
			toast.success('Role assigned');
		}
	});

	const {
		message: unassignMessage,
		submitting: unassigning,
		enhance: unassignEnhance
	} = superForm(data.unassignForm, {
		id: 'unassign-role',
		onUpdated({ form }) {
			if (form.valid) toast.success('Role removed');
		}
	});

	const {
		message: revokeMessage,
		submitting: revoking,
		enhance: revokeEnhance
	} = superForm(data.revokeForm, {
		id: 'revoke-invite',
		onUpdated({ form }) {
			if (form.valid) toast.success('Invite revoked');
		}
	});

	const { message: removeMessage, enhance: removeEnhance } = superForm(data.removeForm, {
		id: 'remove-member',
		onUpdated({ form }) {
			if (form.valid) toast.success('Member removed');
		}
	});
</script>

<svelte:head>
	<title>Staff</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight">Staff</h1>
			<p class="text-muted-foreground">
				Everyone with access to <span class="text-foreground font-medium">{activeOrg.name}</span>,
				the roles they hold, and the invites still waiting to be accepted.
			</p>
		</div>

		{#if data.canManage}
			<div class="flex flex-wrap items-center gap-2">
				<Dialog.Root bind:open={inviteOpen}>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button {...props}>
								<UserPlusIcon />
								Invite staff
							</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-md">
						<Dialog.Header>
							<Dialog.Title>Invite staff</Dialog.Title>
							<Dialog.Description>
								We email a join link for {activeOrg.name}. It only works for this address, and it
								replaces any invite already sent there.
							</Dialog.Description>
						</Dialog.Header>

						<FormAlert message={$inviteMessage} />

						<form method="POST" action="?/invite" class="grid gap-4" use:inviteEnhance>
							<div class="grid gap-2">
								<Label for="invite-email">Email</Label>
								<Input
									id="invite-email"
									name="email"
									type="email"
									autocomplete="off"
									placeholder="teammate@example.com"
									aria-invalid={$inviteErrors.email ? 'true' : undefined}
									aria-describedby={$inviteErrors.email ? 'invite-email-error' : undefined}
									bind:value={$inviteFormData.email}
									{...$inviteConstraints.email}
								/>
								{#if $inviteErrors.email}
									<p id="invite-email-error" class="text-destructive text-sm">
										{$inviteErrors.email}
									</p>
								{/if}
							</div>
							<Dialog.Footer>
								<Button type="submit" disabled={$inviting}>
									{$inviting ? 'Sending…' : 'Send invite'}
								</Button>
							</Dialog.Footer>
						</form>
					</Dialog.Content>
				</Dialog.Root>

				<form method="POST" action="?/createLink" use:linkEnhance>
					<Button type="submit" variant="outline" disabled={$creatingLink}>
						<LinkIcon />
						{$creatingLink ? 'Creating…' : 'Create invite link'}
					</Button>
				</form>
			</div>
		{/if}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Members</Card.Title>
			<Card.Description>
				{data.staff.length === 1
					? 'You are the only person in this organization.'
					: `${data.staff.length} people can sign in to this organization.`}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<FormAlert message={$linkMessage} />
			<FormAlert message={$assignMessage} />
			<FormAlert message={$unassignMessage} />
			<FormAlert message={$removeMessage} />

			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Member</Table.Head>
						<Table.Head>Org role</Table.Head>
						<Table.Head>Roles</Table.Head>
						<Table.Head>Joined</Table.Head>
						{#if data.canRemove}
							<Table.Head class="text-right"><span class="sr-only">Actions</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.staff as member (member.userId)}
						{@const options = roleOptions(member)}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center gap-3">
									<Avatar.Root>
										{#if member.avatarUrl}
											<Avatar.Image src={member.avatarUrl} alt="" />
										{/if}
										<Avatar.Fallback class="text-xs">{initials(member)}</Avatar.Fallback>
									</Avatar.Root>
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span class="truncate font-medium">{memberName(member)}</span>
											{#if member.userId === user?.id}
												<TagBadge tone="info" size="sm">You</TagBadge>
											{/if}
										</div>
										<p class="text-muted-foreground truncate text-xs">{member.email ?? '—'}</p>
									</div>
								</div>
							</Table.Cell>

							<Table.Cell>
								<StatusBadge tone={ORG_ROLE_TONES[member.role]}>{member.role}</StatusBadge>
							</Table.Cell>

							<Table.Cell>
								<div class="flex flex-wrap items-center gap-1.5">
									{#each member.roles as role (role.id)}
										{#if data.canManage}
											<!-- The form wraps the badge: a <form> is not phrasing content, so it
											     cannot live inside the badge's own <span>. -->
											<form method="POST" action="?/unassignRole" use:unassignEnhance>
												<input type="hidden" name="user_id" value={member.userId} />
												<input type="hidden" name="role_id" value={role.id} />
												<TagBadge tone="indigo" class="gap-1 pr-1">
													{role.name}
													<Button
														type="submit"
														variant="ghost"
														size="icon"
														class="size-4 rounded-sm hover:bg-transparent hover:opacity-70"
														disabled={$unassigning}
														aria-label="Remove the {role.name} role from {memberName(member)}"
													>
														<XIcon class="size-3" />
													</Button>
												</TagBadge>
											</form>
										{:else}
											<TagBadge tone="indigo">{role.name}</TagBadge>
										{/if}
									{:else}
										<span class="text-muted-foreground text-xs">No roles</span>
									{/each}
								</div>

								{#if data.canManage}
									<form
										method="POST"
										action="?/assignRole"
										class="mt-2 flex items-center gap-2"
										use:assignEnhance
									>
										<input type="hidden" name="user_id" value={member.userId} />
										<Combobox
											name="role_id"
											size="sm"
											class="w-44"
											{options}
											value={roleChoice[member.userId] ?? ''}
											onchange={(value) => (roleChoice[member.userId] = value)}
											placeholder="Add a role…"
											emptyText="No roles left to add"
											disabled={options.length === 0}
											ariaLabel="Add a role for {memberName(member)}"
										/>
										<Button
											type="submit"
											variant="outline"
											size="sm"
											disabled={$assigning || !roleChoice[member.userId]}
										>
											Assign
										</Button>
									</form>
								{/if}
							</Table.Cell>

							<Table.Cell class="text-muted-foreground text-sm whitespace-nowrap">
								{formatDate(member.joinedAt)}
							</Table.Cell>

							{#if data.canRemove}
								<Table.Cell class="text-right">
									{#if member.userId !== user?.id && member.role === 'member'}
										<form
											method="POST"
											action="?/removeMember"
											class="flex justify-end"
											bind:this={removeForms[member.userId]}
											use:removeEnhance
										>
											<input type="hidden" name="user_id" value={member.userId} />
											<HoldToConfirm
												class="h-8 px-3"
												confirmLabel="Removed"
												onConfirm={() => removeForms[member.userId]?.requestSubmit()}
											>
												Hold to remove
											</HoldToConfirm>
										</form>
									{/if}
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if data.canManage && data.invites.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>Pending invites</Card.Title>
				<Card.Description>
					A link works until it is accepted, expires, or you revoke it here.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<FormAlert message={$revokeMessage} />

				{#each data.invites as invite (invite.id)}
					{@const expired = new Date(invite.expires_at).getTime() < Date.now()}
					<div
						class="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">
								{invite.email ?? 'Anyone with the link'}
							</p>
							<p class="text-muted-foreground text-xs">
								{expired ? 'Expired' : 'Expires'}
								{formatDate(invite.expires_at)}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							{#if expired}
								<StatusBadge tone="warning">Expired</StatusBadge>
							{/if}
							<CopyButton
								value="{page.url.origin}/invite/{invite.token}"
								label="Copy link"
								copiedLabel="Link copied"
							/>
							<form method="POST" action="?/revokeInvite" use:revokeEnhance>
								<input type="hidden" name="invite_id" value={invite.id} />
								<Button
									type="submit"
									variant="ghost"
									disabled={$revoking}
									aria-label="Revoke the invite for {invite.email ?? 'anyone with the link'}"
								>
									Revoke
								</Button>
							</form>
						</div>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
