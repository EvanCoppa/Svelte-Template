<script lang="ts">
	import { createColumnHelper, createTable, renderComponent } from '@tanstack/svelte-table';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { page } from '$app/state';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import XIcon from '@lucide/svelte/icons/x';
	import * as DataTable from '$lib/components/data-table/index.js';
	import { CopyButton, HoldToConfirm } from '$lib/components/enhanced/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Staff from '$lib/components/staff/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { StatusBadge, TagBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { ComboboxOption } from '$lib/components/ui/combobox/combobox.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { StaffMember } from '$lib/server/staff';
	import { capitalize } from '$lib/utils.js';
	import { compensationSchema, inviteSchema } from './schema';

	// A fixed locale, like `dateFormat` below — the server render and the
	// hydrated one must agree, so this can never follow the visitor's own.
	const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function formatWage(value: number | null): string {
		return value === null ? '—' : `${currencyFormat.format(value)}/hr`;
	}

	function formatCommission(value: number | null): string {
		return value === null ? '—' : `${value}%`;
	}

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

	/** The ranks the org-role filter offers, in the tone map's order. */
	const ORG_ROLE_OPTIONS = Object.entries(ORG_ROLE_TONES).map(([value, tone]) => ({
		value,
		label: capitalize(value),
		tone
	}));

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
	 * The roster table. Columns are derived rather than fixed so the actions
	 * column drops out entirely for a reader with nothing to act on — switching
	 * org can change that without the page ever unmounting.
	 */
	const columnHelper = createColumnHelper<DataTable.DataTableFeatures, StaffMember>();

	const columns = $derived.by(() => {
		const defs = columnHelper.columns([
			DataTable.selectColumn(columnHelper),
			// The accessor is what the search box scans and what sorting reads;
			// the cell shows the person. Name first, so sorting stays by name.
			// The only column the search box scans: the rest opt out.
			columnHelper.accessor((member) => `${Staff.memberName(member)} ${member.email ?? ''}`, {
				id: 'member',
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Member' }),
				cell: ({ row }) =>
					renderComponent(Staff.MemberCell, {
						member: row.original,
						isYou: row.original.userId === user?.id
					}),
				enableHiding: false,
				enableGlobalFilter: true,
				meta: { title: 'Member' }
			}),
			// The org role is a filter: the values are the three ranks.
			columnHelper.accessor('role', {
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Org role' }),
				cell: ({ getValue }) => DataTable.statusCell(getValue(), ORG_ROLE_TONES[getValue()]),
				enableGlobalFilter: false,
				filterFn: 'oneOf',
				meta: { title: 'Org role', filter: { options: ORG_ROLE_OPTIONS } }
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
				enableSorting: false,
				enableGlobalFilter: false,
				meta: { title: 'Roles' }
			}),
			columnHelper.accessor('joinedAt', {
				header: ({ column }) =>
					renderComponent(DataTable.ColumnHeader, { column, title: 'Joined' }),
				cell: ({ getValue }) => formatDate(getValue()),
				enableGlobalFilter: false,
				meta: { title: 'Joined' }
			}),
			DataTable.actionsColumn(columnHelper, ({ row }) =>
				renderComponent(Staff.RowActions, {
					name: Staff.memberName(row.original),
					canAssignRoles: data.canAssignRoles,
					canManagePay: data.canManagePay,
					canRemove: canRemoveMember(row.original),
					onManage: () => (managingId = row.original.userId),
					onManagePay: () => openPay(row.original),
					onRemove: () => (removingId = row.original.userId)
				})
			)
		]);
		// Pay is management data, not roster data: the two wage/commission
		// columns only exist on the definition list for a caller who may see
		// them at all — never rendered blank for everyone else.
		if (data.canManagePay) {
			defs.splice(
				defs.length - 1,
				0,
				columnHelper.accessor((member) => member.compensation?.hourlyWage ?? null, {
					id: 'hourlyWage',
					header: ({ column }) =>
						renderComponent(DataTable.ColumnHeader, { column, title: 'Hourly wage' }),
					cell: ({ getValue }) => formatWage(getValue()),
					enableGlobalFilter: false,
					meta: { title: 'Hourly wage' }
				}),
				columnHelper.accessor((member) => member.compensation?.commissionPercent ?? null, {
					id: 'commissionPercent',
					header: ({ column }) =>
						renderComponent(DataTable.ColumnHeader, { column, title: 'Commission' }),
					cell: ({ getValue }) => formatCommission(getValue()),
					enableGlobalFilter: false,
					meta: { title: 'Commission' }
				})
			);
		}
		if (data.canAssignRoles || data.canManagePay || data.canRemove) return defs;
		return defs.filter((def) => def.id !== 'actions');
	});

	const table = createTable({
		features: DataTable.features,
		get data() {
			return data.staff;
		},
		get columns() {
			return columns;
		}
	});

	/**
	 * The per-member dialogs address a member by id, not by a copied row: an
	 * assign, a pay change or a remove reloads the roster underneath them, and
	 * a snapshot would keep showing what the member held before the click.
	 */
	let managingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);
	let payingId = $state<string | null>(null);
	const managing = $derived(data.staff.find((member) => member.userId === managingId) ?? null);
	const removing = $derived(data.staff.find((member) => member.userId === removingId) ?? null);
	const paying = $derived(data.staff.find((member) => member.userId === payingId) ?? null);

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

	// A visible form, unlike the id-only ones above: the reader types an
	// amount, so it validates client-side and binds like `invite`'s does.
	const {
		form: compensationFormData,
		errors: compensationErrors,
		message: compensationMessage,
		constraints: compensationConstraints,
		submitting: settingPay,
		enhance: compensationEnhance
	} = superForm(data.compensationForm, {
		id: 'compensation',
		validators: zod4Client(compensationSchema),
		onUpdated({ form }) {
			if (!form.valid) return;
			payingId = null;
			toast.success('Pay updated');
		}
	});

	/** Opening the dialog fills the form from this row's own pay, once — not a
	 *  continuous sync, so editing one field never fights a rerender. */
	function openPay(member: StaffMember) {
		payingId = member.userId;
		$compensationFormData.user_id = member.userId;
		$compensationFormData.hourly_wage =
			member.compensation?.hourlyWage != null ? String(member.compensation.hourlyWage) : '';
		$compensationFormData.commission_percent =
			member.compensation?.commissionPercent != null
				? String(member.compensation.commissionPercent)
				: '';
	}
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

<div class="space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />

		{#if data.canManage}
			<PageHeader.Actions>
				<form method="POST" action="?/createLink" use:linkEnhance>
					<Button type="submit" variant="outline" disabled={$creatingLink}>
						<LinkIcon />
						{$creatingLink ? 'Creating…' : 'Create invite link'}
					</Button>
				</form>

				<Modal.Root bind:open={inviteOpen}>
					<Modal.Trigger>
						{#snippet child({ props })}
							<Button {...props}>
								<UserPlusIcon />
								Invite staff
							</Button>
						{/snippet}
					</Modal.Trigger>
					<Modal.Content>
						<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
						<form method="POST" action="?/invite" use:inviteEnhance>
							<Modal.Card>
								<Modal.Header>
									<Modal.Title><UserPlusIcon /> Invite staff</Modal.Title>
									<Modal.Description>
										We email a join link for {activeOrg.name}. It only works for this address, and
										it replaces any invite already sent there.
									</Modal.Description>
								</Modal.Header>
								<Modal.Body>
									<FormAlert message={$inviteMessage} class="mb-0" />

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
								</Modal.Body>
							</Modal.Card>
							<Modal.Footer>
								<Modal.Cancel>Cancel</Modal.Cancel>
								<Modal.Action type="submit" disabled={$inviting}>
									{$inviting ? 'Sending…' : 'Send invite'}
								</Modal.Action>
							</Modal.Footer>
						</form>
					</Modal.Content>
				</Modal.Root>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="space-y-4">
			<FormAlert message={$linkMessage} />

			<DataTable.Root {table}>
				<DataTable.Toolbar>
					<DataTable.Search placeholder="Search by name or email…" ariaLabel="Search staff" />
					<DataTable.Filters />
					<DataTable.ViewOptions class="ms-auto" />
				</DataTable.Toolbar>
				<DataTable.Content emptyMessage="No members match that search." />
				<DataTable.Pagination noun="member" />
			</DataTable.Root>
		</div>

		<aside class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>{activeOrg.name}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
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

					<div class="border-border space-y-3 border-t pt-3">
						{@render stat('Total members', stats.total)}
						{@render stat('Owners & admins', stats.privileged, 'violet')}
						{@render stat('Holding 2+ roles', stats.multiRole, 'info')}
						{@render stat('Members with no role', stats.unassigned, 'warning')}
						{#if data.canManage}
							{@render stat('Pending invites', data.invites.length, 'neutral')}
						{/if}
					</div>
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
							<div class="border-border space-y-2 rounded-lg border p-3">
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
											size="sm"
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
		</aside>
	</div>
</div>

<!-- Manage roles — the row menu's first action, and where every role change happens. -->
<Modal.Root
	open={managing !== null}
	onOpenChange={(open) => {
		if (!open) {
			managingId = null;
			roleChoice = '';
		}
	}}
>
	<Modal.Content>
		{#if managing}
			{@const options = roleOptions(managing)}
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><ShieldIcon /> Roles for {Staff.memberName(managing)}</Modal.Title>
					<Modal.Description>
						Roles decide which features this person can open, and at what level. Their org role ({managing.role})
						is separate and set on the membership itself.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$assignMessage} class="mb-0" />
					<FormAlert message={$unassignMessage} class="mb-0" />

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

					<form
						method="POST"
						action="?/assignRole"
						class="flex items-center gap-2"
						use:assignEnhance
					>
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
						<Button type="submit" variant="outline" disabled={$assigning || !roleChoice}
							>Assign</Button
						>
					</form>
				</Modal.Body>
			</Modal.Card>
		{/if}
	</Modal.Content>
</Modal.Root>

<!-- Remove from the organization — the one destructive act the roster offers. -->
<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<!-- The form wraps the card and the footer so the hold button can submit it. -->
			<form method="POST" action="?/removeMember" bind:this={removeForm} use:removeEnhance>
				<input type="hidden" name="user_id" value={removing.userId} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><UserMinusIcon /> Remove {Staff.memberName(removing)}?</Modal.Title>
						<Modal.Description>
							They lose access to {activeOrg.name} immediately, along with every role they hold here.
							Nothing they created is deleted, and they can be invited back.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<HoldToConfirm
						class="h-9 px-4"
						confirmLabel="Removed"
						onConfirm={() => removeForm?.requestSubmit()}
					>
						Hold to remove
					</HoldToConfirm>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>

<!-- Set pay — owner/admin only, and never shown to the member it names. -->
<Modal.Root
	open={paying !== null}
	onOpenChange={(open) => {
		if (!open) payingId = null;
	}}
>
	<Modal.Content>
		{#if paying}
			<form method="POST" action="?/setCompensation" use:compensationEnhance>
				<input type="hidden" name="user_id" value={paying.userId} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><WalletIcon /> Pay for {Staff.memberName(paying)}</Modal.Title>
						<Modal.Description>
							Visible to owners and admins only — never on the roster a plain member sees.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$compensationMessage} class="mb-0" />

						<div class="grid gap-2">
							<Label for="compensation-hourly-wage">Hourly wage</Label>
							<Input
								id="compensation-hourly-wage"
								name="hourly_wage"
								inputmode="decimal"
								placeholder="0.00"
								aria-invalid={$compensationErrors.hourly_wage ? 'true' : undefined}
								aria-describedby={$compensationErrors.hourly_wage
									? 'compensation-hourly-wage-error'
									: undefined}
								bind:value={$compensationFormData.hourly_wage}
								{...$compensationConstraints.hourly_wage}
							/>
							{#if $compensationErrors.hourly_wage}
								<p id="compensation-hourly-wage-error" class="text-destructive text-sm">
									{$compensationErrors.hourly_wage}
								</p>
							{/if}
						</div>

						<div class="grid gap-2">
							<Label for="compensation-commission-percent">Commission percent</Label>
							<Input
								id="compensation-commission-percent"
								name="commission_percent"
								inputmode="decimal"
								placeholder="0"
								aria-invalid={$compensationErrors.commission_percent ? 'true' : undefined}
								aria-describedby={$compensationErrors.commission_percent
									? 'compensation-commission-percent-error'
									: undefined}
								bind:value={$compensationFormData.commission_percent}
								{...$compensationConstraints.commission_percent}
							/>
							{#if $compensationErrors.commission_percent}
								<p id="compensation-commission-percent-error" class="text-destructive text-sm">
									{$compensationErrors.commission_percent}
								</p>
							{/if}
						</div>
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$settingPay}>
						{$settingPay ? 'Saving…' : 'Save'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
