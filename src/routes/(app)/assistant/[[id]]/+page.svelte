<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { recordSnapshots } from '$lib/ai/snapshots';
	import { threadDialogs } from '$lib/assistant.svelte';
	import * as Assistant from '$lib/components/assistant/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { recordHref } from '$lib/crm/records';
	import { QUERY } from '$lib/queries';
	import {
		bookSlotSchema,
		packOrderSchema,
		packResultSchema,
		renameConversationSchema
	} from '$lib/schemas/assistant';

	let { data } = $props();

	/** The thread on screen, or null while a new one has not been sent yet. */
	const activeId = $derived(page.params.id ?? null);

	/**
	 * Whether a voice call is open. The composer's commit button starts one
	 * when there is nothing written to send, and closing the screen is what
	 * hangs up — see `Assistant.Call`.
	 */
	let calling = $state(false);

	/** Openers, offered by the composer's `+` — each is just a prompt to edit and send. */
	const SUGGESTIONS = [
		'Which companies are still leads?',
		'What is open in the ticket queue?',
		'Summarize the pipeline by stage',
		'Show me every supplier as a table',
		'Find an hour free next week for a site visit'
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

	// --- the artifacts' writes -------------------------------------------
	//
	// A slot picked on a pick-a-time card and a box opened from a packing card
	// are mutations born in a gesture on this page, so each is a form action
	// here, posted through a hidden form the way the calendar's drag-to-move
	// posts `move`: the card hands the values up, the page fills the form
	// from script and submits it, and the answer comes back the superforms
	// road — a toast on success, the message on refusal.

	/** The `startsAt` of every slot booked this session, so a card draws it as taken. */
	const booked = new SvelteSet<string>();
	let bookFormEl = $state<HTMLFormElement | null>(null);

	const { form: bookData, enhance: bookEnhance } = superForm(data.bookForm, {
		id: 'book-slot',
		validators: zod4Client(bookSlotSchema),
		invalidateAll: false,
		onUpdated({ form }) {
			if (form.valid) {
				booked.add(form.data.starts_at);
				toast.success('Booked', {
					action: { label: 'Open calendar', onClick: () => goto('/calendar') }
				});
			} else {
				toast.error(form.message ?? 'Could not book the slot.');
			}
		},
		onError() {
			toast.error('Could not book the slot.');
		}
	});

	async function book(slot: { title: string; startsAt: string; endsAt: string }) {
		$bookData = { title: slot.title, starts_at: slot.startsAt, ends_at: slot.endsAt };
		// The hidden inputs take the store's values on the next flush.
		await tick();
		bookFormEl?.requestSubmit();
	}

	/** The box each packing card opened, by order id, so the card can point at it. */
	const shipments = new SvelteMap<string, string>();
	let packFormEl = $state<HTMLFormElement | null>(null);

	const {
		form: packData,
		submitting: packing,
		enhance: packEnhance
	} = superForm(data.packForm, {
		id: 'pack-order',
		// The lines are an array: the document is posted, not the inputs.
		dataType: 'json',
		validators: zod4Client(packOrderSchema),
		invalidateAll: false,
		onResult({ result }) {
			if (result.type !== 'success') return;
			// The action answers with the box it opened beside the form.
			const opened = packResultSchema.safeParse(result.data);
			if (!opened.success) return;
			const { shipmentId } = opened.data;
			shipments.set($packData.order_id, shipmentId);
			toast.success('Box opened', {
				action: { label: 'Pack it', onClick: () => goto(recordHref('shipment', shipmentId)) }
			});
		},
		onUpdated({ form }) {
			if (!form.valid) toast.error(form.message ?? 'Could not open a box.');
		},
		onError() {
			toast.error('Could not open a box.');
		}
	});

	async function pack(orderId: string, lines: { id: string; quantity: string }[]) {
		$packData = { order_id: orderId, lines };
		await tick();
		packFormEl?.requestSubmit();
	}
</script>

<!-- What a picked slot posts: the title and the two instants, nothing else. -->
<form method="POST" action="?/book" class="hidden" bind:this={bookFormEl} use:bookEnhance>
	<input type="hidden" name="title" value={$bookData.title} />
	<input type="hidden" name="starts_at" value={$bookData.starts_at} />
	<input type="hidden" name="ends_at" value={$bookData.ends_at} />
</form>

<!-- What a packed box posts: the whole document, as `dataType: 'json'` sends it. -->
<form method="POST" action="?/pack" class="hidden" bind:this={packFormEl} use:packEnhance></form>

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
					class="relative z-10 {started ? '' : 'pointer-events-none opacity-0'}"
				>
					{@const snapshots = recordSnapshots(chat.messages)}
					{#each chat.messages as message, index (message.id)}
						<Assistant.Message
							{message}
							status={chat.status}
							last={index === chat.messages.length - 1}
							onApprove={(id) => chat.addToolApprovalResponse({ id, approved: true })}
							onDeny={(id) => chat.addToolApprovalResponse({ id, approved: false })}
							{snapshots}
							{booked}
							onBook={book}
							{shipments}
							packing={$packing}
							onPack={pack}
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
								class="text-foreground mb-10 animate-[fade-up_var(--duration-page)_var(--ease-out-strong)_both] text-center text-4xl font-normal tracking-tight md:text-5xl"
							>
								How can I help you today?
							</h2>
						{/if}

						{#if !data.configured}
							<FormAlert
								variant="default"
								class="w-full"
								message="The assistant is not configured on this server. Set OPENAI_API_KEY to turn it on."
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
							onCall={data.configured ? () => (calling = true) : undefined}
						/>
					</div>
				</div>
			{/snippet}
		</Assistant.Root>
	{/key}
</div>

<!--
	The call: talking to the assistant instead of typing at it, over the same
	tools and the same data. It is the page's rather than the shell's because
	the button that starts it is in this page's composer, and the workspace it
	is about is the one this page is already showing.
-->
<Assistant.Call
	open={calling}
	modelId={data.voiceModel}
	workspace={data.activeOrg.name}
	onClose={() => (calling = false)}
/>

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
