<script lang="ts">
	import type { ChatStatus } from 'ai';
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		isAssistantToolPart,
		type AssistantToolUIPart,
		type AssistantUIMessage
	} from '$lib/ai/types';
	import * as Bubble from '$lib/components/ui/bubble/index.js';
	import * as Message from '$lib/components/ui/message/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Activity from './assistant-activity.svelte';
	import Markdown from './assistant-markdown.svelte';
	import Reasoning from './assistant-reasoning.svelte';
	import Shimmer from './assistant-shimmer.svelte';
	import ToolCall from './assistant-tool-call.svelte';

	/**
	 * One message. The reader's own turn is a bubble on the end side; the
	 * assistant's is the page's own text — full width, no avatar, nothing
	 * framing it — so the answer reads as the screen talking rather than as a
	 * card in a feed.
	 *
	 * Its parts render on `part.type` as the SDK lays them out: text as
	 * markdown, reasoning folded, and tool calls in one of two places. A call
	 * the reader was asked about is a question, so it keeps its card with
	 * Approve and Deny; every other call is activity, and they collapse
	 * together into the one line above the answer.
	 */
	let {
		ref = $bindable(null),
		class: className,
		message,
		status,
		last = false,
		onApprove,
		onDeny,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		message: AssistantUIMessage;
		/** The thread's status — what says this message is still being written. */
		status: ChatStatus;
		/** True for the newest message, the only one a status can be about. */
		last?: boolean;
		onApprove?: (approvalId: string) => void;
		onDeny?: (approvalId: string) => void;
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
	/** Nothing written yet, and the turn is still running: the wait has a word. */
	const waiting = $derived(!isUser && last && status === 'streaming' && !hasText);
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
	class={cn(className)}
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
							<Markdown text={part.text} />
						</Bubble.Content>
					</Bubble.Root>
				{:else if part.type === 'reasoning'}
					<Reasoning text={part.text} />
				{:else if isAssistantToolPart(part) && isApproval(part)}
					<ToolCall {part} {onApprove} {onDeny} />
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
