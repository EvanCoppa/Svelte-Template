<script lang="ts">
	import type { ChatStatus } from 'ai';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { RecordSnapshot } from '$lib/ai/snapshots';
	import {
		isAssistantToolPart,
		type AssistantToolUIPart,
		type AssistantUIMessage
	} from '$lib/ai/types';
	import * as Bubble from '$lib/components/ui/bubble/index.js';
	import * as Message from '$lib/components/ui/message/index.js';
	import { graphNodeId } from '$lib/crm/graph';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Activity from './assistant-activity.svelte';
	import Graph from './assistant-graph.svelte';
	import List from './assistant-list.svelte';
	import Markdown from './assistant-markdown.svelte';
	import Packing from './assistant-packing.svelte';
	import Reasoning from './assistant-reasoning.svelte';
	import RecordCard from './assistant-record-card.svelte';
	import Shimmer from './assistant-shimmer.svelte';
	import Slots from './assistant-slots.svelte';
	import ToolCall from './assistant-tool-call.svelte';

	/**
	 * One message. The reader's own turn is a bubble on the end side; the
	 * assistant's is the page's own text — full width, no avatar, nothing
	 * framing it — so the answer reads as the screen talking rather than as a
	 * card in a feed.
	 *
	 * Its parts render on `part.type` as the SDK lays them out: text as
	 * markdown, reasoning folded, and tool calls in one of three places. A
	 * call the reader was asked about is a question, so it keeps its card with
	 * Approve and Deny; a call whose result is an ARTIFACT — a list, a record,
	 * a map of connections, free time, what is left to ship — is drawn where
	 * it landed, as the component the rest of the app draws that thing with;
	 * and every call is activity, so they all collapse together into the one
	 * line above the answer, which is where a reader finds out what ran.
	 *
	 * The artifacts that write — a slot booked, a box opened — hand the act
	 * back up: the page owns the forms that post them, so the handlers and
	 * what they have done so far arrive as props.
	 */
	let {
		ref = $bindable(null),
		class: className,
		message,
		status,
		last = false,
		onApprove,
		onDeny,
		snapshots,
		booked,
		onBook,
		shipments,
		packing = false,
		onPack,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		message: AssistantUIMessage;
		/** The thread's status — what says this message is still being written. */
		status: ChatStatus;
		/** True for the newest message, the only one a status can be about. */
		last?: boolean;
		onApprove?: (approvalId: string) => void;
		onDeny?: (approvalId: string) => void;
		/** The records the thread has read (`recordSnapshots()`), for the change an edit is shown against. */
		snapshots?: ReadonlyMap<string, RecordSnapshot>;
		/** The `startsAt` of every slot booked from the pick-a-time cards this session. */
		booked?: ReadonlySet<string>;
		onBook?: (slot: { title: string; startsAt: string; endsAt: string }) => void;
		/** The box each packing card opened, by order id. */
		shipments?: ReadonlyMap<string, string>;
		/** True while a box is being opened. */
		packing?: boolean;
		onPack?: (orderId: string, lines: { id: string; quantity: string }[]) => void;
	} = $props();

	const isUser = $derived(message.role === 'user');
	const userText = $derived(
		message.parts
			.filter((part) => part.type === 'text')
			.map((part) => part.text)
			.join('\n')
	);
	const tokens = $derived(
		(message.metadata?.inputTokens ?? 0) + (message.metadata?.outputTokens ?? 0)
	);

	/**
	 * A call that went through the reader keeps its card: the one being asked
	 * about, the one just answered, and the one that was refused — a denial
	 * collapsed into the activity line would report the act as done, which is
	 * the opposite of what happened. Everything else is activity.
	 */
	function isApproval(part: AssistantToolUIPart): boolean {
		return (
			part.state === 'approval-requested' ||
			part.state === 'approval-responded' ||
			part.state === 'output-denied'
		);
	}

	const toolParts = $derived(message.parts.filter(isAssistantToolPart));
	const activity = $derived(toolParts.filter((part) => !isApproval(part)));
	const hasText = $derived(message.parts.some((part) => part.type === 'text' && part.text.trim()));
	/** Thinking that is already on screen, saying the same thing a shimmer would. */
	const hasReasoning = $derived(
		message.parts.some((part) => part.type === 'reasoning' && part.text.trim())
	);
	/**
	 * Nothing written yet, and the turn is still running: the wait has a word.
	 * Only when nothing else is already speaking for it — the activity line and
	 * the thinking block both say what is happening, and two shimmers saying it
	 * at once is one too many.
	 */
	const waiting = $derived(!isUser && last && status === 'streaming' && !hasText && !hasReasoning);

	/**
	 * Your own message snaps into place; the reply arrives. The 150ms between
	 * them is doing real work — it is what makes the two read as a question and
	 * an answer rather than as two rows appearing together.
	 */
	const entrance = $derived(
		isUser
			? 'animate-[fade-up_300ms_var(--ease-out-strong)_both]'
			: 'animate-[fade-up_var(--duration-page)_var(--ease-out-strong)_both]'
	);
	/** The model stopped without an answer — say so rather than showing a blank turn. */
	const unfinished = $derived(
		!isUser && last && status === 'ready' && !hasText && toolParts.length > 0
	);
</script>

<Message.Root
	bind:ref
	data-slot="assistant-message"
	data-role={message.role}
	align={isUser ? 'end' : 'start'}
	class={cn(entrance, className)}
	{...restProps}
>
	{#if isUser}
		<Message.Content>
			<!-- The cap belongs on the root: `Bubble.Content` is already
			     `max-w-full` OF the root, so 85% there would compound with the
			     root's own 80% and cap the bubble at 68% of the row. -->
			<Bubble.Root align="end" variant="muted" class="max-w-[85%]">
				<Bubble.Content class="rounded-3xl px-5 py-2.5 whitespace-pre-wrap">
					{userText}
				</Bubble.Content>
			</Bubble.Root>
		</Message.Content>
	{:else}
		<Message.Content>
			{#if activity.length > 0}
				<Activity parts={activity} class="my-1" />
			{:else if waiting}
				<Shimmer />
			{/if}
			{#each message.parts as part, index (index)}
				{#if part.type === 'text'}
					<Bubble.Root variant="ghost">
						<Bubble.Content>
							<Markdown
								text={part.text}
								streamId="{message.id}:{index}"
								streaming={part.state === 'streaming'}
							/>
						</Bubble.Content>
					</Bubble.Root>
				{:else if part.type === 'reasoning'}
					<Reasoning text={part.text} streaming={part.state === 'streaming'} />
				{:else if isAssistantToolPart(part) && isApproval(part)}
					<ToolCall {part} {onApprove} {onDeny} {snapshots} />
				{:else if part.type === 'tool-getRecord' && part.state === 'output-available'}
					<RecordCard output={part.output} />
				{:else if part.type === 'tool-listRecords' && part.state === 'output-available'}
					<List output={part.output} />
				{:else if part.type === 'tool-exploreGraph' && part.state === 'output-available' && part.output.found}
					<Graph output={part.output} focus={graphNodeId(part.input.kind, part.input.id)} />
				{:else if part.type === 'tool-findOpenSlots' && part.state === 'output-available'}
					<Slots
						output={part.output}
						title={part.input.title}
						booked={booked ?? new Set()}
						onBook={onBook ? (slot) => onBook({ title: part.input.title, ...slot }) : undefined}
					/>
				{:else if part.type === 'tool-packableLines' && part.state === 'output-available'}
					<Packing
						output={part.output}
						shipmentId={part.output.order ? (shipments?.get(part.output.order.id) ?? null) : null}
						pending={packing}
						{onPack}
					/>
				{/if}
			{/each}
			{#if unfinished}
				<p class="text-muted-foreground text-sm">
					I gathered the data but ran out of steps before finishing — ask me to continue.
				</p>
			{/if}
			{#if message.metadata?.model && tokens > 0}
				<Message.Footer class="text-muted-foreground text-xs">
					{message.metadata.model} · {tokens.toLocaleString('en-US')} tokens
				</Message.Footer>
			{/if}
		</Message.Content>
	{/if}
</Message.Root>
