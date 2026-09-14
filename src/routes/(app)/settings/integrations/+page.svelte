<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LockIcon from '@lucide/svelte/icons/lock';
	import MailIcon from '@lucide/svelte/icons/mail';
	import PlugZapIcon from '@lucide/svelte/icons/plug-zap';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ServerOffIcon from '@lucide/svelte/icons/server-off';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import XIcon from '@lucide/svelte/icons/x';
	import { onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import { HoldToConfirm } from '$lib/components/enhanced/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import * as PageHeader from '$lib/components/page-header/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { StatusBadge, TagBadge, type BadgeTone } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import type { Enums } from '$lib/database.types';
	import { QUERY } from '$lib/queries';
	import { showUpgrade } from '$lib/upgrade.svelte';
	import { exclusionSchema, FORM_IDS } from './schema';

	/**
	 * Integrations: the Google mailboxes connected to this organization, and
	 * what each owner decides about theirs — whether the rest of the team sees
	 * it, which addresses never sync, and when it syncs next. A settings page,
	 * so it exists for every org; what it offers follows the `email` feature's
	 * mode and the reader's grant, which the load already worked out.
	 */
	let { data } = $props();

	/**
	 * Connecting starts at a GET endpoint that redirects to Google's consent
	 * screen — a link, not a form action, and a full navigation
	 * (`data-sveltekit-reload`) so the redirect leaves the app rather than
	 * being fetched by the router.
	 */
	const START_HREF = '/api/integrations/google/start';

	// A fixed locale keeps the server render and the hydrated render identical.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
	const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	/** A mailbox's state as a pill: what it is doing, in the badge's tones. */
	const STATUS = {
		active: { tone: 'success', label: 'Syncing' },
		reauthorize: { tone: 'warning', label: 'Needs reconnecting' },
		paused: { tone: 'neutral', label: 'Paused' }
	} satisfies Record<Enums<'mailbox_status'>, { tone: BadgeTone; label: string }>;

	/** What the OAuth callback's `?error=` codes mean to the person who came back. */
	const OAUTH_ERRORS = {
		denied: 'You cancelled the Google sign-in.',
		expired: 'That sign-in took too long. Start again from here.',
		state: 'That sign-in did not match the one started here. Start again.',
		session: 'Sign in as the person who started connecting, in the same organization.',
		exchange: 'Google did not complete the sign-in. Try again in a moment.',
		scopes: 'Both permissions are needed: read your mail and send on your behalf.',
		no_refresh:
			'Google did not issue a refresh token. Remove the app at myaccount.google.com/permissions and connect again.',
		profile: 'Google did not say which address was connected. Try again.'
	};

	function isOauthError(code: string): code is keyof typeof OAUTH_ERRORS {
		return Object.hasOwn(OAUTH_ERRORS, code);
	}

	const oauthError = $derived(
		data.notice.error === null
			? null
			: isOauthError(data.notice.error)
				? OAUTH_ERRORS[data.notice.error]
				: 'Connecting did not finish. Try again.'
	);

	// The callback lands here with the address it connected; say so once.
	onMount(() => {
		if (data.notice.connected) toast.success(`Connected ${data.notice.connected}`);
	});

	/** The first letters of an address's name part, for the mailbox tile. */
	function initialsOf(address: string): string {
		const name = address.split('@')[0] ?? '';
		return (
			name
				.split(/[._-]+/)
				.filter((part) => part !== '')
				.slice(0, 2)
				.map((part) => part.charAt(0).toUpperCase())
				.join('') || '?'
		);
	}

	/**
	 * The id-only forms below post per-row values through hidden inputs, so
	 * their stores never see what is submitted and client validators would
	 * misfire — the server validates them instead (the staff page's shape).
	 * Their ids mirror `FORM_IDS` in the load and the actions, which is what
	 * keeps the no-JS path routing to the form that was submitted.
	 */

	// Sharing is a switch, not a form to fill in: a hidden form bound to the
	// store, filled from script and submitted the way the calendar's drag posts
	// its move (CLAUDE.md, "Server actions vs API endpoints").
	let visibilityElement = $state<HTMLFormElement | null>(null);
	const {
		form: visibilityData,
		message: visibilityMessage,
		submitting: switching,
		enhance: visibilityEnhance
	} = superForm(data.forms.visibility, {
		id: FORM_IDS.visibility,
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(
				form.data.visibility === 'shared'
					? 'Mailbox shared with the organization'
					: 'Mailbox kept private'
			);
			invalidate(QUERY.email);
		}
	});

	async function setVisibility(id: string, shared: boolean) {
		$visibilityData = { id, visibility: shared ? 'shared' : 'private' };
		// The hidden inputs take the store's values on the next flush.
		await tick();
		visibilityElement?.requestSubmit();
	}

	// The one form here a person types into: validated in the browser like
	// every other. Which mailbox it is for is the row's hidden input, copied
	// into the store on submit so the client validator sees the whole post.
	const {
		form: exclusionData,
		errors: exclusionErrors,
		message: exclusionMessage,
		constraints: exclusionConstraints,
		submitting: excluding,
		enhance: exclusionEnhance
	} = superForm(data.forms.exclusion, {
		id: FORM_IDS.exclusion,
		validators: zod4Client(exclusionSchema),
		invalidateAll: false,
		resetForm: false,
		onSubmit({ formData }) {
			// Five rows share one form; the row's hidden input says which mailbox.
			const posted = mailboxIdSchema.safeParse({ id: formData.get('mailbox_id') });
			if (posted.success) $exclusionData.mailbox_id = posted.data.id;
		},
		onUpdated({ form }) {
			if (!form.valid) return;
			// The action echoes the post back, so clearing is this side's job.
			$exclusionData = { ...$exclusionData, pattern: '' };
			toast.success('Address excluded');
			invalidate(QUERY.email);
		}
	});

	const {
		message: removeExclusionMessage,
		submitting: unexcluding,
		enhance: removeExclusionEnhance
	} = superForm(data.forms.removeExclusion, {
		id: FORM_IDS.removeExclusion,
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success('Address included again');
			invalidate(QUERY.email);
		}
	});

	const {
		message: syncMessage,
		submitting: syncing,
		enhance: syncEnhance
	} = superForm(data.forms.syncNow, {
		id: FORM_IDS.syncNow,
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success('Mailbox synced');
			invalidate(QUERY.email);
		}
	});

	/**
	 * Disconnecting addresses a mailbox by id, not by a copied row: the list
	 * reloads underneath the dialog, and a snapshot would go stale.
	 */
	let disconnectingId = $state<string | null>(null);
	const disconnecting = $derived(
		data.mailboxes.find((mailbox) => mailbox.id === disconnectingId) ?? null
	);
	/**
	 * The disconnect form, so the hold button can submit it — HoldToConfirm is
	 * a `type="button"` control, it never submits on its own.
	 */
	let disconnectElement = $state<HTMLFormElement | null>(null);

	const { message: disconnectMessage, enhance: disconnectEnhance } = superForm(
		data.forms.disconnect,
		{
			id: FORM_IDS.disconnect,
			invalidateAll: false,
			onUpdated({ form }) {
				if (!form.valid) return;
				disconnectingId = null;
				toast.success('Mailbox disconnected');
				invalidate(QUERY.email);
			}
		}
	);
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader.Root>
		<PageHeader.Title />
		{#if data.configured && data.access.canManage}
			<PageHeader.Actions>
				<Button href={START_HREF} data-sveltekit-reload>
					<MailIcon />
					Connect Google account
				</Button>
			</PageHeader.Actions>
		{/if}
	</PageHeader.Root>

	{#if oauthError}
		<Alert.Root variant="destructive">
			<CircleAlertIcon />
			<Alert.Title>The Google account was not connected</Alert.Title>
			<Alert.Description>{oauthError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !data.configured}
		<Alert.Root>
			<ServerOffIcon />
			<Alert.Title>Email sync is not configured on this server</Alert.Title>
			<Alert.Description>
				It needs Google OAuth credentials in the server's environment before a mailbox can be
				connected.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.access.mode === 'locked_visible'}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<LockIcon class="size-4" />
					Email sync is on a higher plan
				</Card.Title>
				<Card.Description>
					Connect Google mailboxes and file every conversation on the contact, company or deal it is
					about.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" onclick={() => showUpgrade('email')}>
					<LockIcon class="size-3.5" />
					Upgrade
				</Button>
			</Card.Content>
		</Card.Root>
	{:else if data.access.mode === 'disabled'}
		<Alert.Root>
			<MailIcon />
			<Alert.Title>Email is turned off for this organization</Alert.Title>
			<Alert.Description>
				An owner or admin can
				<a href="/settings/features?feature=email" class="underline underline-offset-4">
					switch it back on under Features
				</a>.
			</Alert.Description>
		</Alert.Root>
	{:else if data.access.mode === 'enabled' && !data.access.canRead}
		<p class="text-muted-foreground text-sm">
			Email is on for this organization, but your roles do not include it.
		</p>
	{:else if data.access.mode !== 'enabled'}
		<p class="text-muted-foreground text-sm">
			No integrations are available for this organization.
		</p>
	{:else if data.mailboxes.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon"><MailIcon /></Empty.Media>
				<Empty.Title>No mailboxes connected</Empty.Title>
				<Empty.Description>
					Connecting a Google account brings in the last year of mail with your contacts, lets you
					reply from a record's page, and shares those conversations with your team — the mailbox is
					shared by default, and any single message can be kept private.
				</Empty.Description>
			</Empty.Header>
			{#if data.configured && data.access.canManage}
				<Empty.Content>
					<Button href={START_HREF} data-sveltekit-reload>
						<MailIcon />
						Connect Google account
					</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<FormAlert message={$visibilityMessage} />
		<FormAlert message={$syncMessage} />

		{#each data.mailboxes as mailbox (mailbox.id)}
			{@const status = STATUS[mailbox.status]}
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex min-w-0 items-center gap-3">
						<Avatar.Root class="size-9">
							<Avatar.Fallback class="{Avatar.avatarTint(mailbox.id)} text-xs font-semibold">
								{initialsOf(mailbox.emailAddress)}
							</Avatar.Fallback>
						</Avatar.Root>
						<span class="truncate">{mailbox.emailAddress}</span>
					</Card.Title>
					<Card.Description>
						Connected by {mailbox.isOwn ? 'you' : mailbox.ownerName} on {date.format(
							new Date(mailbox.createdAt)
						)}.
					</Card.Description>
					<Card.Action>
						<StatusBadge tone={status.tone}>{status.label}</StatusBadge>
					</Card.Action>
				</Card.Header>
				<Card.Content class="space-y-5">
					<div class="text-muted-foreground space-y-1 text-sm">
						{#if mailbox.status === 'reauthorize'}
							<p>Google no longer accepts this mailbox — nothing syncs until it is reconnected.</p>
						{:else if mailbox.backfilledAt === null}
							<p>Backfilling history…</p>
						{:else if mailbox.lastSyncedAt}
							<p>Last synced {datetime.format(new Date(mailbox.lastSyncedAt))}.</p>
						{:else}
							<p>Not synced yet.</p>
						{/if}
						{#if mailbox.lastError}
							<p class="text-xs">Last error: {mailbox.lastError}</p>
						{/if}
					</div>

					{#if mailbox.isOwn}
						<div class="flex items-center gap-4 border-t pt-5">
							<div class="min-w-0 flex-1">
								<Label for="share-{mailbox.id}">Share with the organization</Label>
								<p class="text-muted-foreground text-sm">
									Everyone here sees the conversations in this mailbox; off, only you and the
									organization's owners and admins do. Any single message can be kept private either
									way.
								</p>
							</div>
							<Switch
								id="share-{mailbox.id}"
								checked={mailbox.visibility === 'shared'}
								onCheckedChange={(on) => setVisibility(mailbox.id, on)}
								disabled={$switching}
							/>
						</div>

						<div class="space-y-3 border-t pt-5">
							<div>
								<p class="text-sm font-medium">Excluded addresses</p>
								<p class="text-muted-foreground text-sm">
									Mail to or from these is never synced — an address (a@b.com) or a whole domain
									(@b.com).
								</p>
							</div>
							<FormAlert message={$removeExclusionMessage} class="mb-0" />
							{#if mailbox.exclusions.length > 0}
								<ul class="flex flex-wrap items-center gap-1.5">
									{#each mailbox.exclusions as exclusion (exclusion.id)}
										<li>
											<!-- The form wraps the badge: a <form> is not phrasing content, so it
											     cannot live inside the badge's own <span>. -->
											<form method="POST" action="?/removeExclusion" use:removeExclusionEnhance>
												<input type="hidden" name="id" value={exclusion.id} />
												<TagBadge tone="neutral" class="gap-1 pr-1">
													{exclusion.pattern}
													<Button
														type="submit"
														variant="ghost"
														size="icon"
														class="size-4 rounded-sm hover:bg-transparent hover:opacity-70"
														disabled={$unexcluding}
														aria-label="Stop excluding {exclusion.pattern}"
													>
														<XIcon class="size-3" />
													</Button>
												</TagBadge>
											</form>
										</li>
									{/each}
								</ul>
							{/if}
							<FormAlert message={$exclusionMessage} class="mb-0" />
							<form
								method="POST"
								action="?/addExclusion"
								class="flex items-start gap-2"
								use:exclusionEnhance
							>
								<input type="hidden" name="mailbox_id" value={mailbox.id} />
								<div class="grid flex-1 gap-1.5">
									<Label for="exclusion-{mailbox.id}" class="sr-only">Address or domain</Label>
									<Input
										id="exclusion-{mailbox.id}"
										name="pattern"
										autocomplete="off"
										placeholder="@example.com"
										aria-invalid={$exclusionErrors.pattern ? 'true' : undefined}
										aria-describedby={$exclusionErrors.pattern
											? `exclusion-${mailbox.id}-error`
											: undefined}
										bind:value={$exclusionData.pattern}
										{...$exclusionConstraints.pattern}
									/>
									{#if $exclusionErrors.pattern}
										<p id="exclusion-{mailbox.id}-error" class="text-destructive text-sm">
											{$exclusionErrors.pattern}
										</p>
									{/if}
								</div>
								<Button
									type="submit"
									variant="outline"
									disabled={$excluding || $exclusionData.pattern === ''}
								>
									Add
								</Button>
							</form>
						</div>
					{/if}
				</Card.Content>
				{#if mailbox.isOwn || mailbox.canDisconnect}
					<Card.Footer class="flex-wrap gap-2 border-t">
						{#if mailbox.isOwn && mailbox.status === 'active'}
							<form method="POST" action="?/syncNow" use:syncEnhance>
								<input type="hidden" name="id" value={mailbox.id} />
								<Button type="submit" variant="outline" size="sm" disabled={$syncing}>
									<RefreshCwIcon class={$syncing ? 'animate-spin' : undefined} />
									{$syncing ? 'Syncing…' : 'Sync now'}
								</Button>
							</form>
						{/if}
						{#if mailbox.isOwn && mailbox.status === 'reauthorize' && data.configured}
							<Button href={START_HREF} data-sveltekit-reload variant="outline" size="sm">
								<PlugZapIcon />
								Reconnect
							</Button>
						{/if}
						{#if mailbox.canDisconnect}
							<Button
								variant="outline"
								size="sm"
								class="text-destructive hover:text-destructive ms-auto"
								onclick={() => (disconnectingId = mailbox.id)}
							>
								<UnplugIcon />
								Disconnect
							</Button>
						{/if}
					</Card.Footer>
				{/if}
			</Card.Root>
		{/each}

		<form
			method="POST"
			action="?/setVisibility"
			class="hidden"
			bind:this={visibilityElement}
			use:visibilityEnhance
		>
			<input type="hidden" name="id" value={$visibilityData.id} />
			<input type="hidden" name="visibility" value={$visibilityData.visibility} />
		</form>
	{/if}
</div>

<!-- Disconnect — the one destructive act here, held rather than clicked. -->
<Modal.Root
	open={disconnecting !== null}
	onOpenChange={(open) => {
		if (!open) disconnectingId = null;
	}}
>
	<Modal.Content>
		{#if disconnecting}
			<!-- The form wraps the card and the footer so the hold button can submit it. -->
			<form method="POST" action="?/disconnect" bind:this={disconnectElement} use:disconnectEnhance>
				<input type="hidden" name="id" value={disconnecting.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><UnplugIcon /> Disconnect {disconnecting.emailAddress}?</Modal.Title>
						<Modal.Description>
							Syncing stops and everything this mailbox brought in is removed from the organization.
							Mail that another connected mailbox also holds stays. It can be connected again later.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$disconnectMessage} class="mb-0" />
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<HoldToConfirm
						class="h-9 px-4"
						confirmLabel="Disconnected"
						onConfirm={() => disconnectElement?.requestSubmit()}
					>
						Hold to disconnect
					</HoldToConfirm>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
