<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isAssistantToolPart, type AssistantUIMessage } from '$lib/ai/types';
	import * as Bubble from '$lib/components/ui/bubble/index.js';
	import * as Message from '$lib/components/ui/message/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Markdown from './assistant-markdown.svelte';
	import Reasoning from './assistant-reasoning.svelte';
	import ToolCall from './assistant-tool-call.svelte';

	/**
	 * One message, rendered part by part on `part.type` as the SDK lays it
	 * out: text as markdown, reasoning folded, tool parts as cards with their
	 * state, everything else (step markers, sources) skipped. The user's own
	 * messages are a bubble on the right.
	 */
	let {
		ref = $bindable(null),
		class: className,
		message,
		onApprove,
		onDeny,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		message: AssistantUIMessage;
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
			<Bubble.Root align="end">
				<Bubble.Content class="whitespace-pre-wrap">{userText}</Bubble.Content>
			</Bubble.Root>
		</Message.Content>
	{:else}
		<Message.Avatar class="self-start">
			<span class="flex size-8 items-center justify-center" aria-hidden="true">
				<SparklesIcon class="size-4" />
			</span>
		</Message.Avatar>
		<Message.Content>
			{#each message.parts as part, index (index)}
				{#if part.type === 'text'}
					<Bubble.Root variant="ghost" class="max-w-full">
						<Bubble.Content>
							<Markdown text={part.text} />
						</Bubble.Content>
					</Bubble.Root>
				{:else if part.type === 'reasoning'}
					<Reasoning text={part.text} />
				{:else if isAssistantToolPart(part)}
					<ToolCall {part} {onApprove} {onDeny} />
				{/if}
			{/each}
			{#if message.metadata?.model && tokens > 0}
				<Message.Footer class="text-muted-foreground text-xs">
					{message.metadata.model} · {tokens.toLocaleString('en-US')} tokens
				</Message.Footer>
			{/if}
		</Message.Content>
	{/if}
</Message.Root>
