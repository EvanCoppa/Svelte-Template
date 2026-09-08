import Composer from './assistant-composer.svelte';
import History from './assistant-history.svelte';
import Markdown from './assistant-markdown.svelte';
import Message from './assistant-message.svelte';
import Reasoning from './assistant-reasoning.svelte';
import Root from './assistant-root.svelte';
import Thread from './assistant-thread.svelte';
import ToolCall from './assistant-tool-call.svelte';

/**
 * The assistant, as parts the page composes: `Root` owns the SDK `Chat` for
 * one conversation and hands it to its children; `History` is the rail of
 * threads; `Thread` the scrolling column; `Message` one message rendered on
 * `part.type` (through `Markdown`, `Reasoning` and `ToolCall`); `Composer`
 * the prompt box. The page owns the data — conversations, the stored
 * messages, the forms — and every handler.
 */
export {
	Root,
	History,
	Thread,
	Message,
	Markdown,
	Reasoning,
	ToolCall,
	Composer,
	//
	Root as Assistant,
	History as AssistantHistory,
	Thread as AssistantThread,
	Message as AssistantMessage,
	Markdown as AssistantMarkdown,
	Reasoning as AssistantReasoning,
	ToolCall as AssistantToolCall,
	Composer as AssistantComposer
};
