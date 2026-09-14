<script lang="ts">
	import SendIcon from '@lucide/svelte/icons/send';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import type { Terms } from '$lib/features/terms';
	import { composeEmailSchema } from '$lib/schemas/email';
	import type { EmailMessageView } from '$lib/server/crm/emails';
	import { capitalize } from '$lib/utils.js';

	/**
	 * The compose modal: a new message to this record, or a reply that stays
	 * in its thread, posted to the record page's `?/sendEmail`. The page owns
	 * the form its load built and the message being answered; this part owns
	 * the superForm for it and what a reply is addressed to.
	 *
	 * Seeded the way the calendar's event form is: the page sets `replyTo`,
	 * opens the modal, and calls `openOn()` — the dialog keeps its content
	 * mounted while it animates out, and this form carries the message it
	 * answers, so a second Reply must open on its own message rather than on
	 * the one before it. Never an effect watching the prop: seeding is the
	 * click's job, not a sync.
	 */
	let {
		open = $bindable(false),
		form: composeForm,
		mailboxes,
		replyTo = null,
		terms,
		queryKey
	}: {
		open?: boolean;
		form: SuperValidated<Infer<typeof composeEmailSchema>>;
		/** The reader's own active mailboxes — what the message can be sent from. */
		mailboxes: { id: string; emailAddress: string }[];
		/** The message being answered, or null for a new conversation. */
		replyTo?: EmailMessageView | null;
		/** The feature's words, as the org's industry says them — "New email". */
		terms: Terms;
		/** The record's own query key, refreshed once the message is out. */
		queryKey: string;
	} = $props();

	type ComposeValues = Infer<typeof composeEmailSchema>;

	const fromOptions = $derived(
		mailboxes.map((mailbox) => ({ value: mailbox.id, label: mailbox.emailAddress }))
	);

	/** The reader's own addresses, lower-cased — never a recipient of their own reply. */
	const ownAddresses = $derived(new Set(mailboxes.map((box) => box.emailAddress.toLowerCase())));

	/**
	 * Who a reply goes to: the sender (or their Reply-To), with everyone else
	 * on the message in Cc — minus the reader's own mailboxes. A message the
	 * reader sent is answered to the people it went to instead.
	 */
	function replyRecipients(message: EmailMessageView) {
		const isOwn = (address: string) => ownAddresses.has(address.toLowerCase());
		const withRole = (role: 'to' | 'cc') =>
			message.participants
				.filter((participant) => participant.role === role && !isOwn(participant.address))
				.map((participant) => participant.address);
		const sender =
			message.participants.find((participant) => participant.role === 'reply_to')?.address ??
			message.fromAddress;
		const to = isOwn(sender) ? withRole('to') : [sender];
		const cc = [...(isOwn(sender) ? [] : withRole('to')), ...withRole('cc')].filter(
			(address) => !to.includes(address)
		);
		return { to: [...new Set(to)].join(', '), cc: [...new Set(cc)].join(', ') };
	}

	/** "Re: …" once, the way the action derives it when the subject is left blank. */
	function replySubject(subject: string | null): string {
		if (!subject) return '';
		return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
	}

	// Wired once, like `CreateRecord`, and handed the load's own form object —
	// the calendar's event form says why a wrapper of our own would not do.
	const { form, errors, message, constraints, reset, submitting, enhance } = superForm(
		composeForm,
		{
			id: 'compose-email',
			validators: zod4Client(composeEmailSchema),
			invalidateAll: false,
			resetForm: false,
			onUpdated({ form: result }) {
				// The outbox row keeps its key whether Google accepted the message
				// or not, so a retry after a refusal must carry a fresh one: the
				// old key would collide and read as "already sent".
				if (!result.valid) {
					$form.idempotency_key = crypto.randomUUID();
					return;
				}
				open = false;
				toast.success(`${capitalize(terms.noun)} sent`);
				invalidate(queryKey);
				// The next message is its own send: a fresh key, an empty body.
				$form = { ...$form, body: '', in_reply_to: '', idempotency_key: crypto.randomUUID() };
			}
		}
	);

	/** What the form opens on: the load's form, addressed to the reply's people when there is one. */
	const seed = $derived.by((): ComposeValues => {
		const base = {
			...composeForm.data,
			mailbox_id: composeForm.data.mailbox_id || (mailboxes[0]?.id ?? '')
		};
		if (!replyTo) return base;
		return {
			...base,
			...replyRecipients(replyTo),
			bcc: '',
			subject: replySubject(replyTo.subject),
			in_reply_to: replyTo.id,
			body: ''
		};
	});

	/** Cc and Bcc stay behind a link until they hold something. */
	let showCc = $state(false);

	/**
	 * Open the form on the message the page is showing — or on nothing. The
	 * page calls it for every open rather than trusting a fresh mount, for the
	 * reason above. What goes in is the new seed, with no errors and no
	 * message left over from the last send.
	 */
	export function openOn() {
		showCc = seed.cc !== '' || seed.bcc !== '';
		reset({ data: seed });
	}

	// Born on its seed, by the same road a reopen takes.
	openOn();
</script>

<Modal.Root bind:open>
	<!-- Roomier than the default tray: a message wants width to read. -->
	<Modal.Content class="sm:max-w-2xl">
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/sendEmail" use:enhance>
			<input type="hidden" name="in_reply_to" value={$form.in_reply_to} />
			<input type="hidden" name="idempotency_key" value={$form.idempotency_key} />
			{#if mailboxes.length === 1}
				<!-- One mailbox is no choice: it posts without a picker. -->
				<input type="hidden" name="mailbox_id" value={$form.mailbox_id} />
			{/if}
			<Modal.Card>
				<Modal.Header>
					<Modal.Title>
						<SendIcon />
						{replyTo ? 'Reply' : `New ${terms.noun}`}
					</Modal.Title>
					{#if replyTo}
						<Modal.Description>
							Answers {replyTo.fromName ?? replyTo.fromAddress} in the same thread.
						</Modal.Description>
					{/if}
				</Modal.Header>
				<Modal.Body class="grid gap-4">
					<FormAlert message={$message} class="mb-0" />

					{#if mailboxes.length > 1}
						<div class="grid gap-2">
							<Label for="compose-from">From</Label>
							<Combobox
								id="compose-from"
								name="mailbox_id"
								options={fromOptions}
								bind:value={$form.mailbox_id}
								searchable={false}
								invalid={$errors.mailbox_id !== undefined}
							/>
							{#if $errors.mailbox_id}
								<p class="text-destructive text-sm">{$errors.mailbox_id}</p>
							{/if}
						</div>
					{/if}

					<div class="grid gap-2">
						<div class="flex items-center justify-between">
							<Label for="compose-to">To</Label>
							{#if !showCc}
								<Button
									variant="link"
									size="sm"
									class="h-auto p-0 text-xs"
									onclick={() => (showCc = true)}
								>
									Cc/Bcc
								</Button>
							{/if}
						</div>
						<Input
							id="compose-to"
							name="to"
							autocomplete="off"
							placeholder="name@example.com, another@example.com"
							aria-invalid={$errors.to ? 'true' : undefined}
							aria-describedby={$errors.to ? 'compose-to-error' : undefined}
							bind:value={$form.to}
							{...$constraints.to}
						/>
						{#if $errors.to}
							<p id="compose-to-error" class="text-destructive text-sm">{$errors.to}</p>
						{/if}
					</div>

					{#if showCc}
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="grid gap-2">
								<Label for="compose-cc">Cc</Label>
								<Input
									id="compose-cc"
									name="cc"
									autocomplete="off"
									aria-invalid={$errors.cc ? 'true' : undefined}
									aria-describedby={$errors.cc ? 'compose-cc-error' : undefined}
									bind:value={$form.cc}
									{...$constraints.cc}
								/>
								{#if $errors.cc}
									<p id="compose-cc-error" class="text-destructive text-sm">{$errors.cc}</p>
								{/if}
							</div>
							<div class="grid gap-2">
								<Label for="compose-bcc">Bcc</Label>
								<Input
									id="compose-bcc"
									name="bcc"
									autocomplete="off"
									aria-invalid={$errors.bcc ? 'true' : undefined}
									aria-describedby={$errors.bcc ? 'compose-bcc-error' : undefined}
									bind:value={$form.bcc}
									{...$constraints.bcc}
								/>
								{#if $errors.bcc}
									<p id="compose-bcc-error" class="text-destructive text-sm">{$errors.bcc}</p>
								{/if}
							</div>
						</div>
					{/if}

					<div class="grid gap-2">
						<Label for="compose-subject">Subject</Label>
						<!-- A reply keeps its thread's subject, so the field is there to read, not to change. -->
						<Input
							id="compose-subject"
							name="subject"
							autocomplete="off"
							readonly={replyTo !== null}
							class={replyTo ? 'text-muted-foreground' : undefined}
							aria-invalid={$errors.subject ? 'true' : undefined}
							aria-describedby={$errors.subject ? 'compose-subject-error' : undefined}
							bind:value={$form.subject}
							{...$constraints.subject}
						/>
						{#if $errors.subject}
							<p id="compose-subject-error" class="text-destructive text-sm">{$errors.subject}</p>
						{/if}
					</div>

					<div class="grid gap-2">
						<Label for="compose-body">Message</Label>
						<Textarea
							id="compose-body"
							name="body"
							rows={10}
							aria-invalid={$errors.body ? 'true' : undefined}
							aria-describedby={$errors.body ? 'compose-body-error' : undefined}
							bind:value={$form.body}
							{...$constraints.body}
						/>
						{#if $errors.body}
							<p id="compose-body-error" class="text-destructive text-sm">{$errors.body}</p>
						{/if}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Sending…' : 'Send'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
