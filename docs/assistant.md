# The assistant: an AI feature built the AI SDK's way

The assistant at `/assistant` is a chat over the organization's data, built on the
[Vercel AI SDK](https://ai-sdk.dev) (`ai` v7, `@ai-sdk/svelte`, `@ai-sdk/anthropic`). The
rule for everything in it: **the SDK's own mechanism is the answer to every AI concern.**
When the SDK documents a way to do something, that is the way it is done here, under the
SDK's own names, so its documentation reads as documentation of this code.

The SDK ships its docs inside the package — `node_modules/ai/docs/` — matching the
installed version exactly. Read those before the website when working here.

## The shape of one turn

1. The page renders `Assistant.Root`, which owns one `Chat` (`@ai-sdk/svelte`) for the
   conversation on screen. Its `DefaultChatTransport` posts **only the last message** to
   `/assistant/stream`, plus the SDK's `trigger` (`submit-message` or
   `regenerate-message`), the message id being regenerated, and the browser's time zone.
2. The endpoint (`src/routes/(app)/assistant/stream/+server.ts`) sits under the feature's
   route, so the hook has already checked the session, the feature mode and the read
   grant. It loads the stored thread, runs it through `validateUIMessages` against the
   current tools and metadata schema, folds the incoming message in, and — on a thread's
   first message — titles the thread with one `generateText` call.
3. `createAgentUIStreamResponse` runs the agent and returns the UI message stream. The
   response's message ids come from `createIdGenerator`, message metadata from the
   `messageMetadata` callback, and the whole thread is saved from `onEnd`.
4. In the page, `Assistant.Message` renders each message part on `part.type`: `text` as
   markdown, `reasoning` folded, `tool-<name>` as a card that shows the SDK's tool states,
   including `approval-requested` with Approve and Deny.

## The agent

`src/lib/server/ai/agent.ts` defines the assistant as the SDK's `ToolLoopAgent`: model,
`instructions`, `tools`, `stopWhen: isStepCount(12)`, `prepareStep` (tools withdrawn on
the last step so a turn ends in text), `toolApproval`, `toolsContext`, `activeTools`. The
endpoint constructs it per request, because two of those settings are the request's:

- **`toolsContext`** — every tool declares a `contextSchema` (`src/lib/server/ai/context.ts`:
  the request-scoped Supabase client, the org context and the caller) and receives it as
  `context` in `execute`. It is a construction-time setting in this SDK version, so the
  agent is built where the request is.
- **`activeTools`** — see "Tools are linked to features".

The model comes from `src/lib/server/ai/provider.ts` and nowhere else. `ANTHROPIC_API_KEY`
turns the assistant on; `AI_MODEL` picks the model (default `claude-opus-5`). Unconfigured,
the page says so and the endpoint answers 503.

Instructions are two system messages (`src/lib/server/ai/prompts.ts`): the stable persona,
carrying Anthropic's `cacheControl` marker, then a `<session_context>` block with the org,
the caller, their role and the time zone. The split is the cache boundary.

## Tools are linked to features

A tool is one file in `src/lib/server/ai/tools/`: an SDK `tool()` with a zod `inputSchema`
and `outputSchema`, the shared `contextSchema`, and an `execute` that calls a CRM data
module (`src/lib/server/crm/*`) with the request client — never `.from()` directly, so RLS,
column grants and the `unwrap` error contract apply exactly as they do for a person.

Next to each tool sits its **access**: the feature whose data it touches and the level it
needs there, on the same `read < manage < delete` ladder the rest of the app is gated on.

| tool            | feature | level  | approval |
| --------------- | ------- | ------ | -------- |
| `searchClients` | clients | read   |          |
| `getClient`     | clients | read   |          |
| `addNote`       | clients | manage |          |
| `listTasks`     | tasks   | read   |          |
| `createTask`    | tasks   | manage |          |
| `completeTask`  | tasks   | manage |          |
| `deleteTask`    | tasks   | delete | user     |
| `listDeals`     | deals   | read   |          |
| `listTickets`   | tickets | read   |          |

`activeToolNames(org)` (`tools/index.ts`) keeps a tool only when the feature's mode for
the org is `enabled` **and** the caller holds the level — the same intersection the hook
enforces for pages. The result is the agent's `activeTools`, so the model never sees a tool
it may not call: switch tasks off for an org and the task tools vanish from the model's
view; a member holding only `read` on tasks can list them and nothing more. Every tool
still runs `requireToolContext()` first, so a stale call replayed from a stored thread
fails as a tool error the model can explain rather than reaching a data module.

The `assistant` feature itself grants nothing beyond the page. Opening it is a `read`
grant on `assistant`; what the assistant can _do_ for you is your grants on everything
else.

`deleteTask` is listed under `toolApproval` as `'user-approval'`: the model's call pauses
as an `approval-requested` part, the card shows Approve and Deny, and
`addToolApprovalResponse` plus `sendAutomaticallyWhen:
lastAssistantMessageIsCompleteWithApprovalResponses` resumes the turn. On the server,
the browser's copy of the assistant message is **not** trusted: only its approval
decisions are copied onto the stored message, by approval id.

Adding a tool: a new file exporting the `tool()` and its `ToolAccess`, one line in each of
the two maps in `tools/index.ts`, a label in `src/lib/ai/labels.ts`. The type of
`AssistantUIMessage` follows, so the page's `tool-<name>` part is typed on arrival.

## Persistence

Two tables (`assistant` migration): `assistant_conversations` (org-scoped, private to the
member who started it — RLS checks both) and `assistant_messages`, which stores the SDK's
`UIMessage`s verbatim: `role`, `parts`, `metadata`, and `position` for order. The key is
`(conversation_id, id)`. `src/lib/server/ai/conversations.ts` is the one module that reads
and writes them, on the crm modules' contract.

The client mints a new thread's id (the page load does, so the server render and the
hydrated page agree); the first turn creates the row. `regenerate` and an edited prompt
trim the stored thread before the model answers again. `updated_at` is bumped by a
trigger on message insert, which is what orders the history rail.

## Metadata

`messageMetadataSchema` (`src/lib/ai/schemas.ts`) types what a message carries about
itself: `createdAt`, `model`, `inputTokens`, `outputTokens`. The endpoint attaches it at
`start` and `finish`; the composer stamps `createdAt` on the user's own messages; the
`Chat` validates it with `messageMetadataSchema`. It is stored with the message.

## What is deliberately not here yet

- **Data parts** (`createUIMessageStream` + `writer.write({ type: 'data-…' })`) for UI that
  is not a tool result. The message type's second parameter is `never` until one exists.
- **Attachments**, **retrieval** (needs pgvector and an ingest path), **stream
  resumption** (`resumeStream` needs a stream store), and an embedded assistant on other
  pages.
- **`experimental_toolApprovalSecret`** — with the server owning the thread and merging
  only approval decisions, a forged approval cannot rewrite a tool call; add the secret if
  the trust model ever changes.
