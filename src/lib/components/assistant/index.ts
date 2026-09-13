import Activity from './assistant-activity.svelte';
import Composer from './assistant-composer.svelte';
import Markdown from './assistant-markdown.svelte';
import Message from './assistant-message.svelte';
import Reasoning from './assistant-reasoning.svelte';
import Root from './assistant-root.svelte';
import Shimmer from './assistant-shimmer.svelte';
import Thread from './assistant-thread.svelte';
import ToolCall from './assistant-tool-call.svelte';

/**
 * The assistant, as parts the page composes: `Root` owns the SDK `Chat` for
 * one conversation and hands it to its children; `Thread` is the scrolling
 * column; `Message` one message rendered on `part.type` (through `Markdown`,
 * `Reasoning`, `Activity` and `ToolCall`); `Shimmer` the wait before the
 * first word; `Composer` the prompt box. The page owns the data — the stored
 * messages, the suggestions — and every handler. The member's threads are the
 * sidebar's (`$lib/components/assistant-sidebar.svelte`), because under
 * `/assistant` they are what the shell navigates.
 */
export {
	Root,
	Thread,
	Message,
	Markdown,
	Reasoning,
	Activity,
	ToolCall,
	Shimmer,
	Composer,
	//
	Root as Assistant,
	Thread as AssistantThread,
	Message as AssistantMessage,
	Markdown as AssistantMarkdown,
	Reasoning as AssistantReasoning,
	Activity as AssistantActivity,
	ToolCall as AssistantToolCall,
	Shimmer as AssistantShimmer,
	Composer as AssistantComposer
};
