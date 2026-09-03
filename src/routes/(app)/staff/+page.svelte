<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import LinkIcon from '@lucide/svelte/icons/link';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import XIcon from '@lucide/svelte/icons/x';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { CopyButton, HoldToConfirm } from '$lib/components/enhanced/index.js';
	import * as Staff from '$lib/components/staff/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge, TagBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { StaffMember } from '$lib/server/staff';
	import { inviteSchema } from './schema';

	let { data } = $props();

	let user = $derived(page.data.user);
	// From the (app) layout via this page's own typed data, never optional here.
	let activeOrg = $derived(data.activeOrg);

	/** Org role is a rank, not a status: three fixed tones, one per rank. */
	const ORG_ROLE_TONES = {
		owner: 'violet',
		admin: 'info',
		member: 'neutral'
	} satisfies Record<StaffMember['role'], BadgeTone>;

	// A fixed locale keeps the server render and the hydrated render identical;
	// the visitor's own locale would differ from the server's and flag a mismatch.
	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	function formatDate(value: string): string {
		return dateFormat.format(new Date(value));
	}

	/**
	 * Removal is offered for plain members only, and never for yourself: leaving
	 * your own org is a different act with different consequences, and the
	 * action refuses it. RLS decides the rest independently.
	 */
	function canRemoveMember(member: StaffMember): boolean {
		return data.canRemove && member.role === 'member' && member.userId !== user?.id;
	}

	/** Roles the org offers that this member does not already hold. */
	function roleOptions(member: StaffMember): ComboboxOption[] {
		const held = new Set(member.roles.map((role) => role.id));
		return data.roles
			.filter((role) => !held.has(role.id))
			.map((role) => ({
				value: role.id,
				label: role.name,
				sublabel: role.description ?? undefined
			}));
	}

	/**
	 * What the sidebar reports about the roster. All of it is derived from the
	 * rows already on screen — the counts and the table can never disagree.
	 */
	const stats = $derived.by(() => {
		const privileged = data.staff.filter(
			(member) => member.role === 'owner' || member.role === 'admin'
		).length;
		return {
			total: data.staff.length,
			privileged,
			unassigned: data.staff.filter(
				(member) => member.role === 'member' && member.roles.length === 0
			).length,
			multiRole: data.staff.filter((member) => member.roles.length > 1).length
		};
	});

	/**
	 * Every role this org can hand out, with how many people hold it — including
	 * the ones nobody holds, which is the half a roster cannot show you.
	 */
	const roleDistribution = $derived.by(() => {
		const held: Record<string, number> = {};
		for (const member of data.staff) {
			for (const role of member.roles) {
				held[role.id] = (held[role.id] ?? 0) + 1;
			}
		}
		return data.roles
			.map((role) => ({ id: role.id, name: role.name, count: held[role.id] ?? 0 }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	});

	/**
	 * The roster table. Columns are derived rather than fixed so the actions
	 * column drops out entirely for a reader with nothing to act on — switching
	 * org can change that without the page ever unmounting.
	 */
	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, StaffMember>();

	const columns = $derived.by(() => {
		const defs = columnHelper.columns([
			// The accessor is what the search box filters and what sorting reads;
			// the cell shows the person. Name first, so sorting stays by name.
			columnHelper.accessor((member) => `${Staff.memberName(member)} ${member.email ?? ''}`, {
				id: 'member',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Member' }),
				cell: ({ row }) =>
					renderComponent(Staff.MemberCell, {
						member: row.original,
						isYou: row.original.userId === user?.id
					}),
				enableHiding: false
			}),
			columnHelper.accessor('role', {
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Org role' }),
				cell: ({ getValue }) => DataTable.statusCell(getValue(), ORG_ROLE_TONES[getValue()])
			}),
			columnHelper.accessor((member) => member.roles.map((role) => role.name).join(', '), {
				id: 'roles',
				header: ({ column }) => renderComponent(DataTable.ColumnHeader, { column, title: 'Roles' }),
				cell: ({ row }) =>
					renderComponent(Staff.RolesCell, {
						roles: row.original.roles,
						// Owners and admins hold every feature implicitly, so an empty
						// cell there is not the gap it is for a plain member.
						emptyLabel: row.original.role === 'member' ? 'No roles' : 'Full access'
					}),
				enableSorting: false
			}),
			columnHelper.accessor('joinedAt', {
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Joined' }),
				cell: ({ getValue }) => formatDate(getValue())
			}),
			columnHelper.display({
				id: 'actions',
				header: () => 'Actions',
				cell: ({ row }) =>
					renderComponent(Staff.RowActions, {
						name: Staff.memberName(row.original),
						canManage: data.canManage,
						canRemove: canRemoveMember(row.original),
						onManage: () => (managingId = row.original.userId),
						onRemove: () => (removingId = row.original.userId)
					})
			})
		]);
		if (data.canManage || data.canRemove) return defs;
		return defs.filter((def) => def.id !== 'actions');
	});

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.staff;
		},
		get columns() {
			return columns;
		},
		initialState: { pagination: { pageIndex: 0, pageSize: 10 } }
	});

	const search = $derived(String(table.getColumn('member')?.getFilterValue() ?? ''));

	/**
	 * The two per-member dialogs address a member by id, not by a copied row:
	 * an assign or a remove reloads the roster underneath them, and a snapshot
	 * would keep showing the roles the member held before the click.
	 */
	let managingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);
	const managing = $derived(data.staff.find((member) => member.userId === managingId) ?? null);
	const removing = $derived(data.staff.find((member) => member.userId === removingId) ?? null);

	/** Which role the manage dialog's picker has selected. */
	let roleChoice = $state('');
	/**
	 * The remove form, so the hold button can submit it — HoldToConfirm is a
	 * `type="button"` control, it never submits on its own.
	 */
	let removeForm = $state<HTMLFormElement | null>(null);

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
			roleChoice = '';
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
			if (!form.valid) return;
			removingId = null;
			toast.success('Member removed');
		}
	});
</script>

{#snippet stat(label: string, value: number, tone: BadgeTone | null = null)}
	<div class="flex items-center justify-between gap-3">
		<span class="text-muted-foreground text-sm">{label}</span>
		{#if tone}
			<TagBadge {tone}>{value}</TagBadge>
		{:else}
			<span class="text-lg leading-none font-semibold tabular-nums">{value}</span>
		{/if}
	</div>
{/snippet}

<svelte:head>
	<title>Staff</title>
</svelte:head>

<div class="space-y-6">
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
				<form method="POST" action="?/createLink" use:linkEnhance>
					<Button type="submit" variant="outline" disabled={$creatingLink}>
						<LinkIcon />
						{$creatingLink ? 'Creating…' : 'Create invite link'}
					</Button>
				</form>

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
			</div>
		{/if}
	</div>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="space-y-6">
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

					<DataTable.Root {table}>
						<div class="flex items-center gap-2">
							<Input
								placeholder="Search by name or email…"
								aria-label="Search staff"
								value={search}
								oninput={(event) =>
									table.getColumn('member')?.setFilterValue(event.currentTarget.value)}
								class="max-w-xs"
							/>
							<DataTable.ViewOptions class="ms-auto" />
						</div>
						<DataTable.Content emptyMessage="No members match that search." />
						<DataTable.Pagination noun="member" />
					</DataTable.Root>
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

		<aside class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Organization</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<span class="text-muted-foreground text-sm">Name</span>
						<span class="truncate text-sm font-medium">{activeOrg.name}</span>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span class="text-muted-foreground text-sm">Plan</span>
						<TagBadge tone="violet">{activeOrg.tierName}</TagBadge>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span class="text-muted-foreground text-sm">Your access</span>
						<StatusBadge tone={ORG_ROLE_TONES[activeOrg.role]} class="capitalize">
							{activeOrg.role}
						</StatusBadge>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Staff statistics</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					{@render stat('Total members', stats.total)}
					{@render stat('Owners & admins', stats.privileged, 'violet')}
					{@render stat('Holding 2+ roles', stats.multiRole, 'info')}
					{@render stat('Members with no role', stats.unassigned, 'warning')}
					{#if data.canManage}
						{@render stat('Pending invites', data.invites.length, 'neutral')}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Role distribution</Card.Title>
					<Card.Description>
						The roles {activeOrg.name} can hand out, and how many people hold each.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2">
					{#each roleDistribution as role (role.id)}
						<div class="flex items-center justify-between gap-3">
							<TagBadge tone="indigo">{role.name}</TagBadge>
							<span class="text-muted-foreground text-sm tabular-nums">
								{role.count}
								{role.count === 1 ? 'member' : 'members'}
							</span>
						</div>
					{:else}
						<p class="text-muted-foreground text-sm">This industry ships no roles yet.</p>
					{/each}
					<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
						People can hold several roles, so these add up to more than the roster.
					</p>
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
</div>

<!-- Manage roles — the row menu's first action, and where every role change happens. -->
<Dialog.Root
	open={managing !== null}
	onOpenChange={(open) => {
		if (!open) {
			managingId = null;
			roleChoice = '';
		}
	}}
>
	<Dialog.Content class="sm:max-w-md">
		{#if managing}
			{@const options = roleOptions(managing)}
			<Dialog.Header>
				<Dialog.Title>Roles for {Staff.memberName(managing)}</Dialog.Title>
				<Dialog.Description>
					Roles decide which features this person can open, and at what level. Their org role ({managing.role})
					is separate and set on the membership itself.
				</Dialog.Description>
			</Dialog.Header>

			<FormAlert message={$assignMessage} />
			<FormAlert message={$unassignMessage} />

			<div class="flex flex-wrap items-center gap-1.5">
				{#each managing.roles as role (role.id)}
					<!-- The form wraps the badge: a <form> is not phrasing content, so it
					     cannot live inside the badge's own <span>. -->
					<form method="POST" action="?/unassignRole" use:unassignEnhance>
						<input type="hidden" name="user_id" value={managing.userId} />
						<input type="hidden" name="role_id" value={role.id} />
						<TagBadge tone="indigo" class="gap-1 pr-1">
							{role.name}
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								class="size-4 rounded-sm hover:bg-transparent hover:opacity-70"
								disabled={$unassigning}
								aria-label="Remove the {role.name} role from {Staff.memberName(managing)}"
							>
								<XIcon class="size-3" />
							</Button>
						</TagBadge>
					</form>
				{:else}
					<span class="text-muted-foreground text-sm"
						>No roles yet — this person can sign in, but every gated page is closed to them.</span
					>
				{/each}
			</div>

			<form method="POST" action="?/assignRole" class="flex items-center gap-2" use:assignEnhance>
				<input type="hidden" name="user_id" value={managing.userId} />
				<Combobox
					name="role_id"
					class="flex-1"
					{options}
					value={roleChoice}
					onchange={(value) => (roleChoice = value)}
					placeholder="Add a role…"
					emptyText="No roles left to add"
					disabled={options.length === 0}
					ariaLabel="Add a role for {Staff.memberName(managing)}"
				/>
				<Button type="submit" variant="outline" disabled={$assigning || !roleChoice}>Assign</Button>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Remove from the organization — the one destructive act the roster offers. -->
<Dialog.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Dialog.Content class="sm:max-w-md">
		{#if removing}
			<Dialog.Header>
				<Dialog.Title>Remove {Staff.memberName(removing)}?</Dialog.Title>
				<Dialog.Description>
					They lose access to {activeOrg.name} immediately, along with every role they hold here. Nothing
					they created is deleted, and they can be invited back.
				</Dialog.Description>
			</Dialog.Header>

			<FormAlert message={$removeMessage} />

			<form method="POST" action="?/removeMember" bind:this={removeForm} use:removeEnhance>
				<input type="hidden" name="user_id" value={removing.userId} />
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (removingId = null)}>
						Cancel
					</Button>
					<HoldToConfirm
						class="h-9 px-4"
						confirmLabel="Removed"
						onConfirm={() => removeForm?.requestSubmit()}
					>
						Hold to remove
					</HoldToConfirm>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
