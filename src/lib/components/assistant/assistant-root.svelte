<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import {
		DefaultChatTransport,
		lastAssistantMessageIsCompleteWithApprovalResponses,
		type ChatOnErrorCallback,
		type ChatOnFinishCallback
	} from 'ai';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { messageMetadataSchema } from '$lib/ai/schemas';
	import type { AssistantUIMessage } from '$lib/ai/types';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * The frame of the assistant, and the home of its `Chat`. The SDK's `Chat`
	 * lives as long as the conversation it is for, so it is created here, in the
	 * component the page keys on the conversation id, and handed to the page's
	 * markup as the `children` snippet's argument — the page still owns every
	 * handler and every part it renders.
	 *
	 * The frame itself is one column with the thread and the composer stacked
	 * in it, and a pool of light behind them that is there before the first
	 * question and fades away once the conversation has started.
	 *
	 * The transport sends the last message only (the server owns the thread —
	 * see the stream endpoint) plus the SDK's trigger, and the client's time
	 * zone so "today" resolves where the user is.
	 */
	let {
		ref = $bindable(null),
		class: className,
		id,
		messages,
		api,
		onFinish,
		onError,
		children,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'children'> & {
		/** The conversation id the thread is saved under. */
		id: string;
		/** The stored thread, from the page load. Read once, when the Chat is created. */
		messages: AssistantUIMessage[];
		/** The stream endpoint. */
		api: string;
		onFinish?: ChatOnFinishCallback<AssistantUIMessage>;
		onError?: ChatOnErrorCallback;
		children: Snippet<[Chat<AssistantUIMessage>]>;
	} = $props();

	const chat = new Chat<AssistantUIMessage>({
		id,
		messages,
		messageMetadataSchema,
		transport: new DefaultChatTransport<AssistantUIMessage>({
			api,
			prepareSendMessagesRequest: ({ id: conversationId, messages: all, trigger, messageId }) => {
				const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
				return {
					body:
						trigger === 'regenerate-message'
							? { trigger, id: conversationId, messageId, timeZone }
							: { trigger, id: conversationId, message: all.at(-1), timeZone }
				};
			}
		}),
		// An approved (or denied) tool call resumes the turn without another prompt.
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
		onFinish,
		onError
	});

	const started = $derived(chat.messages.length > 0);
</script>

<div
	bind:this={ref}
	data-slot="assistant"
	class={cn('relative flex min-h-0 flex-col', className)}
	{...restProps}
>
	<div
		class={[
			'aura pointer-events-none absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 motion-reduce:transition-none',
			started ? 'opacity-0' : 'opacity-100'
		]}
		aria-hidden="true"
	></div>
	{@render children(chat)}
</div>

<style>
	/* A small, faint pool of the brand colour behind the opening question —
	   not a wash across the screen. `color-mix` keeps it on the theme's own
	   primary, so it reads the same on a dark ground. */
	.aura {
		width: min(46vw, 460px);
		height: min(40vh, 340px);
		background: radial-gradient(
			ellipse 60% 55% at 50% 45%,
			color-mix(in oklch, var(--primary) 13%, transparent),
			color-mix(in oklch, var(--primary) 6%, transparent) 45%,
			transparent 72%
		);
		filter: blur(40px);
		border-radius: 9999px;
	}
</style>
