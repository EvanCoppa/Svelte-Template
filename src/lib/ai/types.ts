import type { InferUITools, UIMessage } from 'ai';
import type { AssistantTools } from '$lib/server/ai/tools';
import type { AssistantMessageMetadata } from './schemas';

/**
 * The assistant's message type, inferred from the tool set the agent is built
 * with — the SDK's `UIMessage<METADATA, DATA_PARTS, TOOLS>`. The page
 * constructs `Chat<AssistantUIMessage>` with it and the endpoint returns it,
 * so a tool part is `tool-createTask` with typed `input` and `output` on
 * both sides, and a misspelled part name is a type error rather than a
 * silently empty render.
 *
 * The import from `$lib/server` is type-only and erased at build time; no
 * server code reaches the browser through it. Data parts are `never` until
 * the endpoint streams some — add their schemas to `schemas.ts` and widen
 * the second parameter when it does.
 */
export type AssistantUIMessage = UIMessage<
	AssistantMessageMetadata,
	never,
	InferUITools<AssistantTools>
>;

/** One part of an assistant message, for components that render a single part. */
export type AssistantUIMessagePart = AssistantUIMessage['parts'][number];

/**
 * The tool parts of that union — `tool-searchClients`, `tool-createTask`, …
 * — with the SDK's states and the tool's typed input and output. The
 * predicate is the SDK's `isToolUIPart` test (`type` starts with `tool-`),
 * written against this union so it narrows it exactly.
 */
export type AssistantToolUIPart = Extract<AssistantUIMessagePart, { type: `tool-${string}` }>;

export function isAssistantToolPart(part: AssistantUIMessagePart): part is AssistantToolUIPart {
	return part.type.startsWith('tool-');
}
