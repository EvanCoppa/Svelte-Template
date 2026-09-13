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
   markdown, `reasoning` folded, and `tool-<name>` in one of two places — see "The
   screen" below.

## The screen

The assistant is **its own shell**, the way settings is: while the pathname is under
`/assistant` the `(app)` layout swaps `AppSidebar` for `AssistantSidebar`
(`src/lib/components/assistant-sidebar.svelte`), because in a conversation the thing to
navigate is your threads, not the app nav. Its anatomy is the other two sidebars' on
purpose — the workspace switcher and the collapse trigger in the header, the `NavUser`
footer card — so nothing moves when the shell swaps; between them sit **New chat**,
**Back to app**, and the threads. The section's "Chats" label gives way to a search
field that grows out of the magnifier at the end of the row, filtering the list as you
type, so the section costs one row either way. A thread's own menu renames or deletes
it.

Those two acts are **forms on the page** — the actions are on `/assistant` — while the
rows that open them are the sidebar's, so which thread a dialog is about travels through
`$lib/assistant.svelte` (`renameThread()`, `deleteThread()`), the third use of the
module-rune pattern `showUpgrade()` and `showSearch()` established. The sidebar reads the
threads themselves off `page.data.conversations`, like every shell sidebar reads
`page.data`.

The chat surface itself is one column with two states, and it **moves between them
rather than being two screens**: with no messages the composer sits a third of the way
down under "How can I help you today?", over a faint pool of the theme's primary
(`Assistant.Root`'s aura); once the thread has started, the aura fades, the thread
appears, and the composer travels to the foot of the page on a 700ms ease. The thread's
own foot dissolves rather than ending on an edge, because the composer floats over it.

The composer is a rounded card with three controls. **`+` opens the openers** — the
page's own list, passed in as `suggestions` — and picking one puts it **in the box**
rather than sending it, so it can be edited first; that is why there are no opener
chips on the empty screen, and why they stay reachable once a thread is underway. **The
microphone is dictation**, and it is drawn only where the browser has a speech engine
at all (`$lib/speech`, which is the one place that knows the API is still prefixed):
while it listens the icon becomes a level meter and the settled transcript lands in the
draft, so nothing reaches a server that the reader has not read first. **Send becomes
Stop** while an answer streams. The controls sit beside the field while the draft still
fits on one line and drop to their own row under it when it does not — measured off a
hidden copy of the text, because asking "has it wrapped" would wrap, widen, unwrap and
oscillate.

A message is the reader's turn as a bubble on the end side and the assistant's as the
page's own text — full width, no avatar, nothing framing it. Its tool calls land in one
of two places, and which one is not a matter of taste: a call **waiting on the reader**
is a question, so it keeps its `Assistant.ToolCall` card with Approve and Deny; every
other call is activity, and they collapse into the one `Assistant.Activity` line above
the answer — the newest tool named while they run, a count to unfold once they are
done. `Assistant.Shimmer` is the wait before the first word.

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

| tool              | feature   | level  | approval |
| ----------------- | --------- | ------ | -------- |
| `searchCompanies` | companies | read   |          |
| `getCompany`      | companies | read   |          |
| `searchContacts`  | contacts  | read   |          |
| `addNote`         | companies | manage |          |
| `listTasks`       | tasks     | read   |          |
| `createTask`      | tasks     | manage |          |
| `completeTask`    | tasks     | manage |          |
| `deleteTask`      | tasks     | delete | user     |
| `listDeals`       | deals     | read   |          |
| `listTickets`     | tickets   | read   |          |

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
