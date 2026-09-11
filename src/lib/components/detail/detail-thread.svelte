<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SendIcon from '@lucide/svelte/icons/send';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate } from '$app/navigation';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { avatarTint } from '$lib/components/ui/avatar/index.js';
	import * as Bubble from '$lib/components/ui/bubble/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Message from '$lib/components/ui/message/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import type { TaskMessage } from '$lib/server/crm/task-comments';
	import { removeTaskCommentSchema, taskCommentSchema } from '$lib/schemas/task-comments';

	/**
	 * The conversation on a record, and the one form that writes it. The page
	 * owns the messages and the forms its load built; this part draws the card,
	 * posts from the composer, opens the modal on a message's pencil, and posts
	 * to the record page's `?/saveComment` / `?/removeComment` — the same
	 * one-form-two-modes shape the addresses part uses, `id` blank for a new
	 * message and the message's id for a correction.
	 *
	 * Which messages offer edit and remove is the answer RLS gives: the author,
	 * or an owner/admin. Everyone who can open the record can post.
	 */
	let {
		messages,
		form: commentForm,
		removeForm,
		userId,
		canModerate,
		noun,
		queryKey
	}: {
		/** The thread, oldest first — the order a conversation is read in. */
		messages: TaskMessage[];
		form: SuperValidated<Infer<typeof taskCommentSchema>>;
		removeForm: SuperValidated<Infer<typeof removeTaskCommentSchema>>;
		/** The reader, so their own messages are theirs to edit. */
		userId: string;
		/** Owner or admin: may edit and remove anyone's message. */
		canModerate: boolean;
		/** What the record is called — "this task". */
		noun: string;
		/** The record's own query key, refreshed after every post. */
		queryKey: string;
	} = $props();

	// Fixed locale, like every date on a page — see the staff page.
	const datetime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

	let editorOpen = $state(false);
	let removingId = $state<string | null>(null);
	const removing = $derived(messages.find((message) => message.id === removingId) ?? null);

	// What the composer held when an edit took the shared form over, so a reply
	// half-typed is not the price of correcting somebody's spelling.
	let draft = '';

	const { form, errors, message, constraints, submitting, enhance } = superForm(commentForm, {
		id: 'comment',
		validators: zod4Client(taskCommentSchema),
		invalidateAll: false,
		resetForm: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			const edited = editorOpen;
			// The action echoes the post back (`return { form }`), so clearing
			// is this side's job. Not `resetForm`, which fires on both paths and
			// would wipe the half-typed reply `closeEditor()` hands back; an
			// invalid post returns above, so what was typed survives it.
			if (edited) closeEditor();
			else $form = { id: '', body: '' };
			toast.success(edited ? 'Message updated' : 'Message posted');
			invalidate(queryKey);
		}
	});

	const {
		message: removeMessage,
		submitting: deleting,
		enhance: removeEnhance
	} = superForm(removeForm, {
		id: 'remove-comment',
		invalidateAll: false,
		onUpdated({ form: result }) {
			if (!result.valid) return;
			removingId = null;
			toast.success('Message removed');
			invalidate(queryKey);
		}
	});

	function startEditing(target: TaskMessage) {
		draft = $form.body;
		$form = { id: target.id, body: target.body };
		editorOpen = true;
	}

	/** Closing hands the form back to the composer, draft and all. */
	function closeEditor() {
		if (!editorOpen) return;
		editorOpen = false;
		$form = { id: '', body: draft };
		draft = '';
	}

	/** Who wrote it, as the thread says it — never the reader's own name. */
	function nameOf(target: TaskMessage): string {
		if (target.author_id === userId) return 'You';
		// An author whose profile the reader cannot see keeps the message and
		// loses the name: a gap in a conversation reads as data loss.
		return target.authorName ?? 'Someone else';
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
</script>

<Card.Root data-slot="detail-thread">
	<Card.Header>
		<Card.Title>Conversation</Card.Title>
		<Card.Description>
			What people have said about this {noun}, oldest first. It stays with the {noun}.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-6">
		{#if messages.length > 0}
			<Message.Group class="gap-4">
				{#each messages as entry (entry.id)}
					{@const mine = entry.author_id === userId}
					{@const name = nameOf(entry)}
					<Message.Root align={mine ? 'end' : 'start'}>
						<Message.Avatar>
							<span
								class={[
									'flex size-8 items-center justify-center text-xs font-semibold',
									entry.author_id && avatarTint(entry.author_id)
								]}
								aria-hidden="true"
							>
								{initialsOf(name)}
							</span>
						</Message.Avatar>
						<Message.Content>
							<Message.Header class="gap-2">
								<span class="truncate">{name}</span>
								<time datetime={entry.created_at} class="whitespace-nowrap">
									{datetime.format(new Date(entry.created_at))}
								</time>
								{#if entry.updated_at !== entry.created_at}
									<span>· edited</span>
								{/if}
							</Message.Header>
							<Bubble.Root
								variant={mine ? 'default' : 'muted'}
								align={mine ? 'end' : 'start'}
								class="max-w-full sm:max-w-[80%]"
							>
								<!-- User-authored plain text: line breaks are preserved, markup never is. -->
								<Bubble.Content class="whitespace-pre-wrap">{entry.body}</Bubble.Content>
							</Bubble.Root>
							{#if mine || canModerate}
								<Message.Footer class="gap-0.5">
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										title="Edit message"
										onclick={() => startEditing(entry)}
									>
										<PencilIcon class="size-3.5" />
										<span class="sr-only">Edit message</span>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										title="Remove message"
										onclick={() => (removingId = entry.id)}
									>
										<Trash2Icon class="size-3.5" />
										<span class="sr-only">Remove message</span>
									</Button>
								</Message.Footer>
							{/if}
						</Message.Content>
					</Message.Root>
				{/each}
			</Message.Group>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title class="text-base">Nothing said yet</Empty.Title>
					<Empty.Description>
						Ask a question or leave an update; everyone who can open this {noun} can read the thread.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}

		<!-- The composer and the editor are one form, so only one of them is ever
		     on screen: the modal holds it while a message is being corrected. -->
		{#if editorOpen}
			<p class="text-muted-foreground text-sm">Editing a message…</p>
		{:else}
			<form method="POST" action="?/saveComment" use:enhance class="space-y-2">
				<input type="hidden" name="id" value={$form.id} />
				<FormAlert message={$message} class="mb-0" />
				<Label for="thread-body" class="sr-only">Message</Label>
				<Textarea
					id="thread-body"
					name="body"
					rows={3}
					placeholder={`Say something about this ${noun}…`}
					aria-invalid={$errors.body ? 'true' : undefined}
					bind:value={$form.body}
					{...$constraints.body}
				/>
				{#if $errors.body}
					<p class="text-destructive text-sm">{$errors.body}</p>
				{/if}
				<div class="flex justify-end">
					<Button type="submit" disabled={$submitting}>
						<SendIcon />
						{$submitting ? 'Posting…' : 'Post message'}
					</Button>
				</div>
			</form>
		{/if}
	</Card.Content>
</Card.Root>

<Modal.Root
	open={editorOpen}
	onOpenChange={(open) => {
		if (!open) closeEditor();
	}}
>
	<Modal.Content>
		<!-- The form wraps the card and the footer so `Modal.Action type="submit"` posts it. -->
		<form method="POST" action="?/saveComment" use:enhance>
			<input type="hidden" name="id" value={$form.id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title>
						<PencilIcon />
						Edit message
					</Modal.Title>
					<Modal.Description>
						Everyone reading the thread sees the correction, marked as edited.
					</Modal.Description>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$message} class="mb-0" />
					<div class="grid gap-2">
						<Label for="thread-edit-body">Message</Label>
						<Textarea
							id="thread-edit-body"
							name="body"
							rows={5}
							aria-invalid={$errors.body ? 'true' : undefined}
							bind:value={$form.body}
							{...$constraints.body}
						/>
						{#if $errors.body}
							<p class="text-destructive text-sm">{$errors.body}</p>
						{/if}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Save message'}
				</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removingId = null;
	}}
>
	<Modal.Content>
		{#if removing}
			<form method="POST" action="?/removeComment" use:removeEnhance>
				<input type="hidden" name="id" value={removing.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Remove this message?</Modal.Title>
						<Modal.Description>
							{nameOf(removing)} wrote it, and the thread loses it for everyone. The {noun} stays.
						</Modal.Description>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$removeMessage} class="mb-0" />
						<Bubble.Root variant="muted" class="max-w-full">
							<Bubble.Content class="line-clamp-4 whitespace-pre-wrap">
								{removing.body}
							</Bubble.Content>
						</Bubble.Root>
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" disabled={$deleting}>
						{$deleting ? 'Removing…' : 'Remove message'}
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
