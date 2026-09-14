import Activity from './assistant-activity.svelte';
import Aura from './assistant-aura.svelte';
import Call from './assistant-call.svelte';
import Composer from './assistant-composer.svelte';
import Markdown from './assistant-markdown.svelte';
import Message from './assistant-message.svelte';
import Orb from './assistant-orb.svelte';
import Reasoning from './assistant-reasoning.svelte';
import Root from './assistant-root.svelte';
import Shimmer from './assistant-shimmer.svelte';
import Thread from './assistant-thread.svelte';
import ToolCall from './assistant-tool-call.svelte';

/**
 * The assistant, as parts the page composes: `Root` owns the SDK `Chat` for
 * one conversation and hands it to its children; `Aura` the pool of light
 * behind an unstarted one; `Thread` is the scrolling
 * column; `Message` one message rendered on `part.type` (through `Markdown`,
 * `Reasoning`, `Activity` and `ToolCall`); `Shimmer` the wait before the
 * first word; `Composer` the prompt box. `Call` is the same assistant reached
 * by talking — the screen a voice call happens on — and `Orb` the thing it
 * puts you in front of, which is presentational enough to use anywhere. The page owns the data — the stored
 * messages, the suggestions — and every handler. The member's threads are the
 * sidebar's (`$lib/components/assistant-sidebar.svelte`), because under
 * `/assistant` they are what the shell navigates.
 */
export {
	Root,
	Aura,
	Orb,
	Call,
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
	Aura as AssistantAura,
	Orb as AssistantOrb,
	Call as AssistantCall,
	Thread as AssistantThread,
	Message as AssistantMessage,
	Markdown as AssistantMarkdown,
	Reasoning as AssistantReasoning,
	Activity as AssistantActivity,
	ToolCall as AssistantToolCall,
	Shimmer as AssistantShimmer,
	Composer as AssistantComposer
};
