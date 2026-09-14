<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import LockIcon from '@lucide/svelte/icons/lock';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';
	import MailIcon from '@lucide/svelte/icons/mail';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import PenLineIcon from '@lucide/svelte/icons/pen-line';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { invalidate } from '$app/navigation';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { avatarTint } from '$lib/components/ui/avatar/index.js';
	import { Badge, StatusBadge } from '$lib/components/ui/badge/index.js';
	import * as Bubble from '$lib/components/ui/bubble/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Message from '$lib/components/ui/message/index.js';
	import { recordHref } from '$lib/crm/records';
	import type { Terms } from '$lib/features/terms';
	import type { setMessagePrivateSchema } from '$lib/schemas/email';
	import type { EmailCopy, EmailMessageView, EmailThreadView } from '$lib/server/crm/emails';

	/**
	 * The conversations filed on a record — one collapsible per thread, its
	 * messages drawn the way the task thread draws its own — and the one act
	 * this part posts itself: flagging a copy the reader holds private, or
	 * sharing it again, through the record page's `?/setMessagePrivate`.
	 * Writing is the page's: "New email" and every "Reply" hand the message
	 * (or nothing) up through `onCompose`, and the page opens the compose
	 * modal on it, so the form exists once whichever tab is open.
	 *
	 * Which copies offer the privacy toggle is RLS's answer — only the mailbox's
	 * owner may change one — and the page's: `userId` says which copies are the
	 * reader's own.
	 */
	let {
		threads,
		userId,
		isOrgManager,
		canSend,
		canConnect,
		configured,
		privacyForm,
		terms,
		noun,
		queryKey,
		onCompose
	}: {
		/** Most recent conversation first; each thread's messages oldest first. */
		threads: EmailThreadView[];
		/** The reader, so the copies in their own mailbox are theirs to flag. */
		userId: string;
		/** Owner or admin: sees every mailbox's mail, so a private badge says whose. */
		isOrgManager: boolean;
		/** May write: the manage grant and a connected mailbox of their own. */
		canSend: boolean;
		/** May connect a mailbox — the manage grant, with none connected yet. */
		canConnect: boolean;
		/** Whether the server has Google credentials at all. */
		configured: boolean;
		privacyForm: SuperValidated<Infer<typeof setMessagePrivateSchema>>;
		/** The feature's words, as the org's industry says them — "Emails", "email". */
		terms: Terms;
		/** What the record is called — "this contact". */
		noun: string;
		/** The record's own query key, refreshed after every post. */
		queryKey: string;
		/** Open the compose modal: on a message to reply to it, on nothing for a new one. */
		onCompose: (reply: EmailMessageView | null) => void;
	} = $props();

	// Fixed locale, like every date on a page — see the staff page.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

	/**
	 * Which threads are unfolded. The most recent one opens on its own; the
	 * rest stay folded until this reader opens them — this view's own
	 * business, nothing worth a preference.
	 */
	let expanded = $state<Record<string, boolean>>({});

	/** The copy of a message sitting in the reader's own mailbox, if any. */
	function heldCopy(message: EmailMessageView): EmailCopy | null {
		return message.copies.find((copy) => copy.holderUserId === userId) ?? null;
	}

	/** Sent by the reader — from their own mailbox — so it sits on the end side. */
	function isMine(message: EmailMessageView): boolean {
		return message.copies.some((copy) => copy.isSent && copy.holderUserId === userId);
	}

	/**
	 * What a private flag means to this reader: their own copy, or — for an
	 * owner or admin, who sees every mailbox — somebody else's.
	 */
	function privacyLabel(message: EmailMessageView): string | null {
		const held = heldCopy(message);
		if (held?.isPrivate) return 'Private';
		const other = message.copies.find((copy) => copy.isPrivate);
		if (!other) return null;
		return isOrgManager ? `Private to ${other.mailboxAddress}'s mailbox` : 'Private';
	}

	type Person = { address: string; name: string; contactId: string | null };

	/** Everyone in a conversation, each once, in the order they first appear. */
	function peopleOf(thread: EmailThreadView): Person[] {
		const people: Person[] = [];
		for (const message of thread.messages) {
			for (const participant of message.participants) {
				if (participant.role === 'bcc') continue;
				if (people.some((person) => person.address === participant.address)) continue;
				people.push({
					address: participant.address,
					name: participant.display_name ?? participant.address,
					contactId: participant.contact_id
				});
			}
		}
		return people;
	}

	/** Who wrote a message, as the header names them. */
	function senderOf(message: EmailMessageView): string {
		return message.fromName ?? message.fromAddress;
	}

	function initialsOf(name: string): string {
		return (
			name
				.split(/\s+/)
				.slice(0, 2)
				.map((part) => part.charAt(0))
				.join('')
				.toUpperCase() || '?'
		);
	}

	// Flagging is a click, not a form to fill in: a hidden form bound to the
	// store, filled from script and submitted the way the calendar's drag
	// posts its move (CLAUDE.md, "Server actions vs API endpoints").
	let privacyElement = $state<HTMLFormElement | null>(null);
	const {
		form: privacyData,
		message: privacyMessage,
		submitting: flagging,
		enhance: privacyEnhance
	} = superForm(privacyForm, {
		id: 'email-privacy',
		invalidateAll: false,
		onUpdated({ form }) {
			if (!form.valid) return;
			toast.success(form.data.private ? 'Kept private' : 'Shared with the organization');
			invalidate(queryKey);
		}
	});

	async function setPrivate(copy: EmailCopy, isPrivate: boolean) {
		$privacyData = { id: copy.id, private: isPrivate };
		// The hidden inputs take the store's values on the next flush; submitting
		// before it would post the last copy's id.
		await tick();
		privacyElement?.requestSubmit();
	}
</script>

<Card.Root data-slot="detail-email-threads">
	<Card.Header>
		<Card.Title>{terms.name}</Card.Title>
		<Card.Description>
			Conversations with this {noun}, synced from the mailboxes your team connected.
		</Card.Description>
		{#if canSend}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={() => onCompose(null)}>
					<PenLineIcon />
					New {terms.noun}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if threads.length > 0}
			<FormAlert message={$privacyMessage} class="mb-0" />

			<ul class="divide-border divide-y">
				{#each threads as thread, index (thread.id)}
					{@const isOpen = expanded[thread.id] ?? index === 0}
					{@const people = peopleOf(thread)}
					{@const via = thread.messages[0]?.copies[0] ?? null}
					<li class="py-3 first:pt-0 last:pb-0">
						<Collapsible.Root
							open={isOpen}
							onOpenChange={(open) => (expanded[thread.id] = open)}
							class="space-y-2"
						>
							<div class="flex items-start gap-2">
								<Collapsible.Trigger
									class="hover:bg-muted/50 -ml-1 flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-1 py-0.5 text-left"
								>
									<ChevronDownIcon
										class="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-200 {isOpen
											? ''
											: '-rotate-90'}"
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm font-medium">
											{thread.subject ?? '(no subject)'}
										</span>
										<span class="text-muted-foreground block text-xs">
											{#if thread.lastMessageAt}
												<time datetime={thread.lastMessageAt}>
													{datetime.format(new Date(thread.lastMessageAt))}
												</time>
												·
											{/if}
											{thread.messageCount === 1
												? 'One message'
												: `${String(thread.messageCount)} messages`}
										</span>
									</span>
								</Collapsible.Trigger>
								{#if via}
									<Badge variant="outline" class="max-w-48 shrink-0">
										<span class="truncate">via {via.mailboxAddress}</span>
									</Badge>
								{/if}
							</div>

							<!-- Outside the trigger: a link cannot sit inside a button. -->
							{#if people.length > 0}
								<p class="text-muted-foreground pl-5 text-xs">
									{#each people as person, position (person.address)}
										{#if position > 0},{/if}
										{#if person.contactId}
											<a
												href={recordHref('contact', person.contactId)}
												class="text-foreground underline-offset-4 hover:underline"
											>
												{person.name}
											</a>
										{:else}
											<span>{person.name}</span>
										{/if}
									{/each}
								</p>
							{/if}

							<Collapsible.Content class="pt-2 pl-5">
								<Message.Group class="gap-4">
									{#each thread.messages as entry (entry.id)}
										{@const mine = isMine(entry)}
										{@const held = heldCopy(entry)}
										{@const privacy = privacyLabel(entry)}
										{@const name = senderOf(entry)}
										<Message.Root align={mine ? 'end' : 'start'}>
											<Message.Avatar>
												<span
													class={[
														'flex size-8 items-center justify-center text-xs font-semibold',
														avatarTint(entry.fromAddress)
													]}
													aria-hidden="true"
												>
													{initialsOf(name)}
												</span>
											</Message.Avatar>
											<Message.Content>
												<Message.Header class="flex-wrap gap-x-2 gap-y-1">
													<span class="truncate">{name}</span>
													{#if entry.fromName}
														<span class="truncate font-normal">{entry.fromAddress}</span>
													{/if}
													<time datetime={entry.sentAt} class="whitespace-nowrap">
														{datetime.format(new Date(entry.sentAt))}
													</time>
													{#if entry.attachmentCount > 0}
														<span class="flex items-center gap-1 whitespace-nowrap">
															<PaperclipIcon class="size-3" />
															{entry.attachmentCount === 1
																? 'One attachment'
																: `${String(entry.attachmentCount)} attachments`}
														</span>
													{/if}
													{#if privacy}
														<StatusBadge tone="neutral" size="sm" dot={false}>
															<LockIcon class="size-3" />
															{privacy}
														</StatusBadge>
													{/if}
												</Message.Header>
												<Bubble.Root
													variant={mine ? 'default' : 'muted'}
													align={mine ? 'end' : 'start'}
													class="max-w-full sm:max-w-[80%]"
												>
													<!-- Mail is plain text here: line breaks are preserved, markup never is. -->
													<Bubble.Content class="whitespace-pre-wrap">
														{entry.bodyText ?? entry.snippet ?? ''}
													</Bubble.Content>
												</Bubble.Root>
												{#if canSend || held}
													<Message.Footer class="gap-0.5">
														{#if canSend}
															<Button variant="ghost" size="xs" onclick={() => onCompose(entry)}>
																<ReplyIcon />
																Reply
															</Button>
														{/if}
														{#if held}
															<Button
																variant="ghost"
																size="xs"
																disabled={$flagging}
																onclick={() => setPrivate(held, !held.isPrivate)}
															>
																{#if held.isPrivate}
																	<LockOpenIcon />
																	Share
																{:else}
																	<LockIcon />
																	Make private
																{/if}
															</Button>
														{/if}
													</Message.Footer>
												{/if}
											</Message.Content>
										</Message.Root>
									{/each}
								</Message.Group>
							</Collapsible.Content>
						</Collapsible.Root>
					</li>
				{/each}
			</ul>

			<form
				method="POST"
				action="?/setMessagePrivate"
				class="hidden"
				bind:this={privacyElement}
				use:privacyEnhance
			>
				<input type="hidden" name="id" value={$privacyData.id} />
				<input type="hidden" name="private" value={$privacyData.private ? 'true' : 'false'} />
			</form>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Media variant="icon"><MailIcon /></Empty.Media>
					{#if canConnect}
						<Empty.Title class="text-base">Connect your Google account</Empty.Title>
						<Empty.Description>
							Mail between you and this {noun} is filed here once a mailbox is connected, and you can
							reply from this page.
						</Empty.Description>
					{:else if !configured}
						<Empty.Title class="text-base">Email sync is not configured</Empty.Title>
						<Empty.Description>
							This server has no Google credentials set up, so no mail is synced.
						</Empty.Description>
					{:else}
						<Empty.Title class="text-base">No {terms.plural} yet</Empty.Title>
						<Empty.Description>
							Conversations with this {noun} from connected mailboxes show up here.
						</Empty.Description>
					{/if}
				</Empty.Header>
				{#if canConnect}
					<Empty.Content>
						<Button variant="outline" href="/settings/integrations">
							<MailIcon />
							Connect Google account
						</Button>
					</Empty.Content>
				{/if}
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
