<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { threadDialogs } from '$lib/assistant.svelte';
	import * as Assistant from '$lib/components/assistant/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { QUERY } from '$lib/queries';
	import { renameConversationSchema } from '$lib/schemas/assistant';

	let { data } = $props();

	/** The thread on screen, or null while a new one has not been sent yet. */
	const activeId = $derived(page.params.id ?? null);

	/** Openers, offered by the composer's `+` — each is just a prompt to edit and send. */
	const SUGGESTIONS = [
		'Which companies are still leads?',
		'What is open in the ticket queue?',
		'Summarize the pipeline by stage'
	];

	/**
	 * After every turn: a new thread has just been created under the id the
	 * load minted, so move to its URL — the same page, the same Chat (the id
	 * has not changed), now resumable on refresh, with the sidebar refreshed by
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

	/**
	 * The two thread dialogs. Their forms are the page's — the actions are on
	 * this route — while the rows that open them are the sidebar's, so which
	 * thread a dialog is about arrives through `$lib/assistant.svelte`, the way
	 * a locked nav entry reaches the upgrade prompt.
	 */
	const renaming = $derived(threadDialogs.renaming);
	const deleting = $derived(threadDialogs.deleting);

	const {
		form: renameData,
		errors: renameErrors,
		message: renameMessage,
		constraints: renameConstraints,
		submitting: renameSubmitting,
		reset: renameReset,
		enhance: renameEnhance
	} = superForm(data.renameForm, {
		id: 'rename-conversation',
		validators: zod4Client(renameConversationSchema),
		onUpdated({ form }) {
			// House convention: successes toast, failures render inline.
			if (!form.valid) return;
			threadDialogs.closeRename();
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
			threadDialogs.closeDelete();
			toast.success('Conversation deleted');
		}
	});

	// Opening the dialog is what fills the form in, so the field starts on the
	// thread's current name — superforms' own `reset` rather than a write into
	// `$renameData`, which would fight the store it belongs to.
	$effect(() => {
		if (!renaming) return;
		renameReset({ data: { conversation_id: renaming.id, title: renaming.title ?? '' } });
	});
</script>

<!--
	The conversation, and nothing else: the strip of open threads is in the app
	header and the sources rail is docked beside the body, both mounted by the
	shell while you are under `/assistant`. Which is also why this page has no
	`PageHeader` — a page is named once, and here its tab is the name.

	It fills the panel rather than scrolling the document, so the height is the
	viewport less every pixel the shell has already spent: the content panel's
	gap and its border top and bottom, the header and its rule, and
	`.app-content`'s own 24px + 48px (all of them in the (app) layout). Get this
	wrong and the page overflows the panel — a scrollbar on a screen that does
	not scroll — or the composer, which floats at the foot, sits below the fold.
-->
<div
	class="flex h-[calc(100dvh_-_2_*_var(--shell-gap)_-_2px_-_var(--header-height)_-_1px_-_72px)] min-h-[32rem]"
>
	<!-- Keyed on the conversation: another thread is another Chat. -->
	{#key data.conversationId}
		<Assistant.Root
			id={data.conversationId}
			messages={data.initialMessages}
			api="/assistant/stream"
			onFinish={afterTurn}
			onError={(cause) => toast.error(cause.message)}
			class="relative min-h-0 w-full flex-1 flex-col"
		>
			{#snippet children(chat)}
				{@const started = chat.messages.length > 0}
				{@const asked = chat.messages
					.filter((message) => message.role === 'user')
					.map((message) =>
						message.parts
							.filter((part) => part.type === 'text')
							.map((part) => part.text)
							.join('')
					)
					.filter((text) => text.trim().length > 0)}

				<Assistant.Aura faded={started} />

				<Assistant.Thread
					messages={chat.messages}
					status={chat.status}
					class="relative z-10 {started ? '' : 'pointer-events-none opacity-0'}"
				>
					{#each chat.messages as message, index (message.id)}
						<Assistant.Message
							{message}
							status={chat.status}
							last={index === chat.messages.length - 1}
							onApprove={(id) => chat.addToolApprovalResponse({ id, approved: true })}
							onDeny={(id) => chat.addToolApprovalResponse({ id, approved: false })}
						/>
					{/each}

					<!-- The wait between sending and the first word of the answer. -->
					{#if chat.status === 'submitted' && chat.messages.at(-1)?.role === 'user'}
						<Assistant.Shimmer />
					{/if}

					{#if chat.error}
						<div class="flex flex-wrap items-center gap-3">
							<FormAlert class="mb-0 flex-1" message={chat.error.message} />
							<Button variant="outline" size="sm" onclick={() => chat.regenerate()}>Retry</Button>
						</div>
					{/if}
				</Assistant.Thread>

				<!--
					The composer: the middle of an empty screen, under the opening
					question, and the foot of the pane once there is a conversation to
					read. It moves between the two rather than being two boxes.
				-->
				<div
					class={[
						'absolute left-0 z-10 w-full px-4 transition-all duration-700 ease-in-out motion-reduce:transition-none',
						started
							? 'from-background via-background bottom-0 bg-gradient-to-t to-transparent pt-10 pb-6'
							: 'top-1/3 -translate-y-1/2'
					]}
				>
					<div class="mx-auto flex w-full max-w-3xl flex-col items-center xl:max-w-4xl">
						{#if !started}
							<h2
								class="fade-in-up text-foreground mb-10 text-center text-4xl font-normal tracking-tight md:text-5xl"
							>
								How can I help you today?
							</h2>
						{/if}

						{#if !data.configured}
							<FormAlert
								variant="default"
								class="w-full"
								message="The assistant is not configured on this server. Set ANTHROPIC_API_KEY to turn it on."
							/>
						{/if}

						<Assistant.Composer
							status={chat.status}
							disabled={!data.configured}
							history={asked}
							suggestions={SUGGESTIONS}
							class="w-full"
							onSend={(text) => chat.sendMessage({ text, metadata: { createdAt: Date.now() } })}
							onStop={() => chat.stop()}
						/>
					</div>
				</div>
			{/snippet}
		</Assistant.Root>
	{/key}
</div>

<!-- Rename — the row menu's first action. -->
<Modal.Root
	open={renaming !== null}
	onOpenChange={(open) => {
		if (!open) threadDialogs.closeRename();
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

<!-- Delete — the one destructive act the sidebar offers. -->
<Modal.Root
	open={deleting !== null}
	onOpenChange={(open) => {
		if (!open) threadDialogs.closeDelete();
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

<style>
	.fade-in-up {
		animation: fade-in-up 0.5s ease-out forwards;
	}

	@keyframes fade-in-up {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fade-in-up {
			animation: none;
		}
	}
</style>
