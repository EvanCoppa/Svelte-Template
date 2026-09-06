<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as Assistant from '$lib/components/assistant/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { QUERY } from '$lib/queries';
	import type { ConversationSummary } from '$lib/server/ai/conversations';
	import { renameConversationSchema } from './schema';

	let { data } = $props();

	/** The thread on screen, or null while a new one has not been sent yet. */
	const activeId = $derived(page.params.id ?? null);

	/** Openers for the empty thread — each is just a message sent for the user. */
	const SUGGESTIONS = [
		'Which of our clients are still leads?',
		'What is open in the ticket queue?',
		'Summarize the pipeline by stage'
	];

	/**
	 * After every turn: a new thread has just been created under the id the
	 * load minted, so move to its URL — the same page, the same Chat (the id
	 * has not changed), now resumable on refresh, with the rail refreshed by
	 * the load. A stored thread only needs the rail re-ordered.
	 */
	function afterTurn({ isError, isAbort }: { isError: boolean; isAbort: boolean }) {
		if (activeId) {
			invalidate(QUERY.assistant);
		} else if (!isError && !isAbort) {
			goto(`/assistant/${data.conversationId}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	}

	/** The two rail dialogs address a thread by id, not by a copied row (see the staff page). */
	let renaming = $state<ConversationSummary | null>(null);
	let deleting = $state<ConversationSummary | null>(null);

	const {
		form: renameData,
		errors: renameErrors,
		message: renameMessage,
		constraints: renameConstraints,
		submitting: renameSubmitting,
		enhance: renameEnhance
	} = superForm(data.renameForm, {
		id: 'rename-conversation',
		validators: zod4Client(renameConversationSchema),
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			renaming = null;
			toast.success('Conversation renamed');
		}
	});

	const {
		message: deleteMessage,
		submitting: deleteSubmitting,
		enhance: deleteEnhance
	} = superForm(data.deleteForm, {
		id: 'delete-conversation',
		onUpdated({ form }) {
			if (!form.valid) return;
			deleting = null;
			toast.success('Conversation deleted');
		}
	});

	function openRename(conversation: ConversationSummary) {
		$renameData.conversation_id = conversation.id;
		$renameData.title = conversation.title ?? '';
		renaming = conversation;
	}
</script>

<div class="flex h-[calc(100dvh-var(--header-height)-72px)] min-h-[32rem] flex-col gap-4">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">Assistant</h1>
		<p class="text-muted-foreground">
			Ask about {data.activeOrg.name}'s clients, deals, tasks and tickets — answered from your data,
			with anything that removes data asking you first.
		</p>
	</div>

	<!-- Keyed on the conversation: another thread is another Chat. -->
	{#key data.conversationId}
		<Assistant.Root
			id={data.conversationId}
			messages={data.initialMessages}
			api="/assistant/stream"
			onFinish={afterTurn}
			onError={(cause) => toast.error(cause.message)}
			class="min-h-0 flex-1"
		>
			{#snippet children(chat)}
				<Assistant.History
					conversations={data.conversations}
					{activeId}
					onRename={openRename}
					onDelete={(conversation) => (deleting = conversation)}
					class="max-h-48 lg:max-h-none"
				/>

				<div class="flex min-h-0 flex-col gap-3">
					{#if !data.configured}
						<FormAlert
							variant="default"
							class="mb-0"
							message="The assistant is not configured on this server. Set ANTHROPIC_API_KEY to turn it on."
						/>
					{/if}

					<Assistant.Thread messages={chat.messages} status={chat.status}>
						{#if chat.messages.length === 0}
							<Empty.Root class="py-16">
								<Empty.Header>
									<Empty.Media variant="icon"><SparklesIcon /></Empty.Media>
									<Empty.Title>Ask about {data.activeOrg.name}</Empty.Title>
									<Empty.Description>
										Questions are answered from the records you can see, and the assistant asks
										before it deletes anything.
									</Empty.Description>
								</Empty.Header>
								<Empty.Content>
									<div class="flex flex-wrap justify-center gap-2">
										{#each SUGGESTIONS as suggestion (suggestion)}
											<Button
												variant="outline"
												size="sm"
												disabled={!data.configured}
												onclick={() =>
													chat.sendMessage({
														text: suggestion,
														metadata: { createdAt: Date.now() }
													})}
											>
												{suggestion}
											</Button>
										{/each}
									</div>
								</Empty.Content>
							</Empty.Root>
						{:else}
							{#each chat.messages as message (message.id)}
								<Assistant.Message
									{message}
									onApprove={(id) => chat.addToolApprovalResponse({ id, approved: true })}
									onDeny={(id) => chat.addToolApprovalResponse({ id, approved: false })}
								/>
							{/each}
						{/if}

						{#if chat.error}
							<div class="flex flex-wrap items-center gap-3">
								<FormAlert class="mb-0 flex-1" message={chat.error.message} />
								<Button variant="outline" size="sm" onclick={() => chat.regenerate()}>Retry</Button>
							</div>
						{/if}
					</Assistant.Thread>

					<Assistant.Composer
						status={chat.status}
						disabled={!data.configured}
						onSend={(text) => chat.sendMessage({ text, metadata: { createdAt: Date.now() } })}
						onStop={() => chat.stop()}
					/>
				</div>
			{/snippet}
		</Assistant.Root>
	{/key}
</div>

<!-- Rename — the rail menu's first action. -->
<Modal.Root
	open={renaming !== null}
	onOpenChange={(open) => {
		if (!open) renaming = null;
	}}
>
	<Modal.Content>
		<form method="POST" action="?/rename" use:renameEnhance>
			<input type="hidden" name="conversation_id" value={$renameData.conversation_id} />
			<Modal.Card>
				<Modal.Header>
					<Modal.Title><PencilIcon /> Rename conversation</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<FormAlert message={$renameMessage} />
					<div class="grid gap-2">
						<Label for="conversation-title">Name</Label>
						<Input
							id="conversation-title"
							name="title"
							autocomplete="off"
							aria-invalid={$renameErrors.title ? 'true' : undefined}
							aria-describedby={$renameErrors.title ? 'conversation-title-error' : undefined}
							bind:value={$renameData.title}
							{...$renameConstraints.title}
						/>
						{#if $renameErrors.title}
							<p id="conversation-title-error" class="text-destructive text-sm">
								{$renameErrors.title}
							</p>
						{/if}
					</div>
				</Modal.Body>
			</Modal.Card>
			<Modal.Footer>
				<Modal.Cancel>Cancel</Modal.Cancel>
				<Modal.Action type="submit" loading={$renameSubmitting}>Save</Modal.Action>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<!-- Delete — the one destructive act the rail offers. -->
<Modal.Root
	open={deleting !== null}
	onOpenChange={(open) => {
		if (!open) deleting = null;
	}}
>
	<Modal.Content>
		{#if deleting}
			<form method="POST" action="?/delete" use:deleteEnhance>
				<input type="hidden" name="conversation_id" value={deleting.id} />
				<Modal.Card>
					<Modal.Header>
						<Modal.Title><Trash2Icon /> Delete this conversation?</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<FormAlert message={$deleteMessage} />
						<p class="text-muted-foreground text-sm">
							"{deleting.title ?? 'New conversation'}" and every message in it are removed for good.
							Nothing the assistant changed in your data is undone.
						</p>
					</Modal.Body>
				</Modal.Card>
				<Modal.Footer>
					<Modal.Cancel>Cancel</Modal.Cancel>
					<Modal.Action type="submit" color="primary-destructive" loading={$deleteSubmitting}>
						Delete
					</Modal.Action>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
