import Activity from './assistant-activity.svelte';
import Artifact from './assistant-artifact.svelte';
import Aura from './assistant-aura.svelte';
import Composer from './assistant-composer.svelte';
import Diff from './assistant-diff.svelte';
import Graph from './assistant-graph.svelte';
import List from './assistant-list.svelte';
import Markdown from './assistant-markdown.svelte';
import Message from './assistant-message.svelte';
import Packing from './assistant-packing.svelte';
import Reasoning from './assistant-reasoning.svelte';
import RecordCard from './assistant-record-card.svelte';
import Root from './assistant-root.svelte';
import Shimmer from './assistant-shimmer.svelte';
import Slots from './assistant-slots.svelte';
import Thread from './assistant-thread.svelte';
import ToolCall from './assistant-tool-call.svelte';

/**
 * The assistant, as parts the page composes: `Root` owns the SDK `Chat` for
 * one conversation and hands it to its children; `Aura` the pool of light
 * behind an unstarted one; `Thread` is the scrolling
 * column; `Message` one message rendered on `part.type` (through `Markdown`,
 * `Reasoning`, `Activity` and `ToolCall`); `Shimmer` the wait before the
 * first word; `Composer` the prompt box. The page owns the data — the stored
 * messages, the suggestions — and every handler. The member's threads are the
 * sidebar's (`$lib/components/assistant-sidebar.svelte`), because under
 * `/assistant` they are what the shell navigates.
 *
 * The artifacts are the tool results `Message` draws as components rather
 * than folding into `Activity`, every one inside the same `Artifact` frame:
 * `RecordCard` (a `getRecord`), `List` (a `listRecords`, the list page's own
 * table), `Graph` (an `exploreGraph`, the graph page's own map), `Slots` (a
 * `findOpenSlots`, booked through the page's form), `Packing` (a
 * `packableLines`, packed through the page's form) and `Diff` (an
 * `updateRecord` waiting for approval, inside its `ToolCall` card).
 */
export {
	Root,
	Aura,
	Thread,
	Message,
	Markdown,
	Reasoning,
	Activity,
	ToolCall,
	Shimmer,
	Composer,
	Artifact,
	RecordCard,
	List,
	Graph,
	Slots,
	Packing,
	Diff,
	//
	Root as Assistant,
	Aura as AssistantAura,
	Thread as AssistantThread,
	Message as AssistantMessage,
	Markdown as AssistantMarkdown,
	Reasoning as AssistantReasoning,
	Activity as AssistantActivity,
	ToolCall as AssistantToolCall,
	Shimmer as AssistantShimmer,
	Composer as AssistantComposer,
	Artifact as AssistantArtifact,
	RecordCard as AssistantRecordCard,
	List as AssistantList,
	Graph as AssistantGraph,
	Slots as AssistantSlots,
	Packing as AssistantPacking,
	Diff as AssistantDiff
};
