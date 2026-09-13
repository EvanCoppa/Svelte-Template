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
</script>

<div
	bind:this={ref}
	data-slot="assistant"
	class={cn(
		'grid min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-1',
		className
	)}
	{...restProps}
>
	{@render children(chat)}
</div>
