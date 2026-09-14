<script lang="ts">
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { openThreads, threadDialogs } from '$lib/assistant.svelte';
	import { breadcrumbs } from '$lib/breadcrumbs.svelte';
	import { sourcesOf, type Source } from '$lib/ai/sources';
	import * as Assistant from '$lib/components/assistant/index.js';
	import * as ContextPanel from '$lib/components/context-panel/index.js';
	import * as TabStrip from '$lib/components/tab-strip/index.js';
	import * as Modal from '$lib/components/modal/index.js';
	import { FormAlert } from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { QUERY } from '$lib/queries';
	import { RECORD_KIND_META, recordHref, recordTerms } from '$lib/crm/records';
	import { iconFor } from '$lib/features/icons';
	import { iconForPath } from '$lib/navigation';
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
	 * The strip of open threads. Ids are the store's; the names come from the
	 * thread list the sidebar already has, so a rename renames its tab and a
	 * delete drops it with nothing else to keep in step. The thread on screen
	 * is always a tab, whether or not it has been recorded yet.
	 */
	afterNavigate(() => {
		if (activeId) openThreads.open(activeId);
		openThreads.keepOnly(new Set(data.conversations.map((conversation) => conversation.id)));
	});

	const tabs = $derived.by(() => {
		const byId = new Map(data.conversations.map((conversation) => [conversation.id, conversation]));
		const open = openThreads.ids
			.filter((id) => byId.has(id))
			.map((id) => ({ id, title: byId.get(id)?.title ?? 'New conversation' }));
		// A thread whose first turn has not landed yet is on screen but not in
		// the list, so it would otherwise have no tab of its own.
		if (!activeId) return [...open, { id: null, title: 'New conversation' }];
		return open;
	});

	/**
	 * The sources, in piles by kind. A kind is named as this org's industry
	 * names it and only appears at all when `terms` carries its feature —
	 * which is exactly the set this session may see, so a kind the reader
	 * cannot open is never listed as somewhere to go.
	 */
	function grouped(sources: Source[]) {
		const kinds = [...new Set(sources.map((source) => source.kind))];
		return kinds.flatMap((kind) => {
			const feature = RECORD_KIND_META[kind].feature;
			if (!page.data.terms?.[feature]) return [];
			return [
				{
					kind,
					label: recordTerms(page.data.terms, kind).name,
					icon: iconFor(iconForPath(`/${RECORD_KIND_META[kind].segment}`, page.data.nav ?? [])),
					href: (id: string) => recordHref(kind, id),
					sources: sources.filter((source) => source.kind === kind)
				}
			];
		});
	}

	/** Where a closed tab hands you: its neighbour, or a new thread. */
	function closeTab(id: string) {
		const index = tabs.findIndex((tab) => tab.id === id);
		openThreads.close(id);
		if (id !== activeId) return;
		const next = tabs[index + 1] ?? tabs[index - 1];
		goto(next?.id ? `/assistant/${next.id}` : '/assistant');
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
	The chat fills the panel rather than scrolling the document, so the height is
	the viewport less everything the shell has already spent on it: the content
	panel's gap top and bottom, the header, and `.app-content`'s own 24px + 48px
	(all three in the (app) layout). Get this wrong and the composer, which
	floats at the foot, sits below the fold.
-->
<div
	class="flex h-[calc(100dvh_-_2_*_var(--shell-gap)_-_var(--header-height)_-_72px)] min-h-[32rem]"
>
	<!-- Keyed on the conversation: another thread is another Chat. -->
	{#key data.conversationId}
		<Assistant.Root
			id={data.conversationId}
			messages={data.initialMessages}
			api="/assistant/stream"
			onFinish={afterTurn}
			onError={(cause) => toast.error(cause.message)}
			class="min-h-0 w-full flex-1 flex-row gap-4"
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
				{@const groups = grouped(sourcesOf(chat.messages))}

				<!--
					The conversation's own pane. The strip of open threads names the one
					on screen, which is why this screen has no `PageHeader` — a page is
					named once, and here its tab is the name. The document title and the
					breadcrumb still come from the `pages` row, as everywhere.
				-->
				<section
					class="border-border bg-card relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm"
				>
					<!--
						The strip is this screen's own navigation, so a tab starts the
						breadcrumb trail rather than deepening it — the pairing every
						shell surface makes (see `$lib/breadcrumbs.svelte`). Without it,
						flicking between two threads reads as walking two steps down.
					-->
					<TabStrip.Root aria-label="Open conversations">
						{#each tabs as tab (tab.id ?? 'new')}
							{@const href = tab.id ? `/assistant/${tab.id}` : '/assistant'}
							<TabStrip.Tab
								{href}
								label={tab.title}
								active={tab.id === activeId}
								onclick={() => breadcrumbs.startAt(href)}
							>
								{#if tab.id}
									{@const id = tab.id}
									<TabStrip.Close label={tab.title} onclick={() => closeTab(id)} />
								{/if}
							</TabStrip.Tab>
						{/each}
						<TabStrip.Add
							href="/assistant"
							label="New conversation"
							onclick={() => breadcrumbs.startAt('/assistant')}
						/>
					</TabStrip.Root>

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
								? 'from-card via-card bottom-0 bg-gradient-to-t to-transparent pt-10 pb-6'
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
				</section>

				<!--
					What the answer drew on: the records the tools actually returned,
					read back out of the thread. A record links only where this session
					can open its kind at all — `terms` carries exactly the features it
					may see — so the panel never offers a door that would 404.
				-->
				<ContextPanel.Root>
					<ContextPanel.Header>
						<ContextPanel.Title>Sources</ContextPanel.Title>
						<ContextPanel.Actions>
							<!-- What is listed, not what was found: a kind this session cannot
							     open is not a source it can go to. -->
							<span class="text-xs tabular-nums">
								{groups.reduce((total, group) => total + group.sources.length, 0)}
							</span>
						</ContextPanel.Actions>
					</ContextPanel.Header>
					<ContextPanel.Body>
						{#each groups as group (group.kind)}
							<ContextPanel.Section label={group.label} count={group.sources.length}>
								{#each group.sources as source (source.id)}
									{@const Icon = group.icon}
									<ContextPanel.Item href={group.href(source.id)}>
										{#snippet icon()}<Icon />{/snippet}
										{source.name}
									</ContextPanel.Item>
								{/each}
							</ContextPanel.Section>
						{:else}
							<p class="text-muted-foreground px-2 py-1.5 text-sm">
								Nothing yet. Records the assistant reads to answer you show up here.
							</p>
						{/each}
					</ContextPanel.Body>
				</ContextPanel.Root>
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
