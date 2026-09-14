# The assistant: an AI feature built the AI SDK's way

The assistant at `/assistant` is a chat over the organization's data, built on the
[Vercel AI SDK](https://ai-sdk.dev) (`ai` v7, `@ai-sdk/svelte`, `@ai-sdk/openai`). The
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
**Home**, and the threads. The section's "Chats" label gives way to a search
field that grows out of the magnifier at the end of the row, filtering the list as you
type, so the section costs one row either way. A thread's own menu renames or deletes
it.

Those two acts are **forms on the page** — the actions are on `/assistant` — while the
rows that open them are the sidebar's, so which thread a dialog is about travels through
`$lib/assistant.svelte` (`renameThread()`, `deleteThread()`), the third use of the
module-rune pattern `showUpgrade()` and `showSearch()` established. The sidebar reads the
threads themselves off `page.data.conversations`, like every shell sidebar reads
`page.data`.

The shell does two more things for this screen, and both are the shell's rather
than the page's — a strip of tabs in the app header, and a rail of context docked
beside the body — so the page below them is only ever the conversation.

The **tab strip** (`src/lib/components/tab-strip/`) goes in the one header that
every screen already has, composed for this feature by `AssistantTabs`
(`src/lib/components/assistant-tabs.svelte`), which `AppHeader` mounts while the
pathname is under `/assistant` — the branch the `(app)` layout makes to swap the
sidebar, made once more. One tab per thread this browser tab has open, closeable,
with a `+` for another; which threads are open is `sessionStorage`, ids only, so a
rename renames its tab and a delete drops it with nothing to keep in step
(`openThreads` in `$lib/assistant.svelte`). The strip is the screen's own
navigation, so a tab **starts** the breadcrumb trail rather than deepening it —
and because the strip names the thread on screen, the breadcrumb trail stands down
beside it and this page has **no `PageHeader`**: a page is named once, and here its
tab is the name. The way out of the shell is the sidebar's Home, as it is under
`/settings`.

The **context rail** (`src/lib/components/context-panel/`, composed by
`AssistantContext`) is a panel of its own on the end side of the body, mounted by
the `(app)` layout beside `Sidebar.Inset` and standing the same height as it — not
a card inside the page, which would sit inside the content panel's padding and
scroll with it. It hides itself below `lg`, where the conversation needs the width.

Being outside the page is what the thread has to cross: the `Chat` lives in
`Assistant.Root`, so Root publishes a **getter** for its messages through
`assistantThread` (`$lib/assistant.svelte`) and the rail reads them from there —
the mirror of `threadDialogs`, which carries the sidebar's question the other way.

The rail shows **what the answer drew on** — the records the tools actually
returned, read back out of the message parts by `sourcesOf()` (`$lib/ai/sources`)
rather than tracked separately, so a stored thread shows the same sources on reload as
it did while it streamed. A kind is named as the org's industry names it and appears at
all only when `terms` carries its feature, which is exactly the set this session may
see: the panel never offers a door that would 404, and it counts what it lists rather
than what it found.

The conversation pane itself is one column with two states, and it **moves between them
rather than being two screens**: with no messages the composer sits a third of the way
down under "How can I help you today?", over a faint pool of the theme's primary
(`Assistant.Aura`); once the thread has started, the aura fades, the thread
appears, and the composer travels to the foot of the page on a 700ms ease. The thread's
own foot dissolves rather than ending on an edge, because the composer floats over it.

The composer is a rounded card with three controls. **`+` opens the openers** — the
page's own list, passed in as `suggestions` — and picking one puts it **in the box**
rather than sending it, so it can be edited first; that is why there are no opener
chips on the empty screen, and why they stay reachable once a thread is underway. **The
microphone is dictation**, and it is drawn only where the browser has a speech engine
at all (`$lib/speech`, which is the one place that knows the API is still prefixed):
while it listens the icon becomes a level meter and the settled transcript lands in the
draft, so nothing reaches a server that the reader has not read first. The controls sit
beside the field while the draft still fits on one line and drop to their own row under
it when it does not — measured off a hidden copy of the text, because asking "has it
wrapped" would wrap, widen, unwrap and oscillate.

**The fourth control is whatever there is to commit**, and it is one button in one
place with three states: Send with something written, **Stop** while an answer streams,
and — with an empty box — **Call**. An empty box is not a mistake to grey a button out
for, it is a different way of asking, so the button does not sit there disabled waiting
for typing; it offers the other way in. That is also why dictation keeps its own
microphone beside it: putting words in the box and talking to someone are not the same
act.

A message is the reader's turn as a bubble on the end side and the assistant's as the
page's own text — full width, no avatar, nothing framing it. Its tool calls land in one
of two places, and which one is not a matter of taste: a call **waiting on the reader**
is a question, so it keeps its `Assistant.ToolCall` card with Approve and Deny; every
other call is activity, and they collapse into the one `Assistant.Activity` line above
the answer — the newest tool named while they run, a count to unfold once they are
done. `Assistant.Shimmer` is the wait before the first word.

## The call

Pressing the composer's button on an empty box opens a **voice call**: the same
assistant, the same tools over the same organization's data, reached by talking
instead of writing. It is the product this template is selling — you can ask your
business a question out loud and it goes and looks.

**The SDK's realtime mechanism is the mechanism**, as everywhere else here.
`ai` ships `Experimental_AbstractRealtimeSession`, which owns the socket, captures
the microphone, plays the model's audio, stops that playback the instant you start
talking again, assembles both sides of the conversation into `UIMessage`s and
normalises tool calls. It is deliberately framework-agnostic — one abstract
`setState` is the whole of a binding, which is what `@ai-sdk/react`'s
`experimental_useRealtime` implements with React state. `@ai-sdk/svelte` has no
realtime binding yet, so `src/lib/ai/realtime.svelte.ts` is that same binding in
runes (`SvelteRealtimeSession`), and `VoiceCall` around it is the app's own part:
the microphone permission, the mute switch, the input level the orb breathes with,
and which tool is running. Nothing in it re-implements something the SDK has.

**The key never leaves the server.** `POST /assistant/realtime/token` is the SDK's
setup endpoint: it builds the session (`voiceSessionConfig()` in
`src/lib/server/ai/realtime.ts`), mints a short-lived client secret with
`openai.experimental_realtime.getToken()` through `provider.ts`, and answers with
`{ token, url, expiresAt, tools }`. The browser opens the WebSocket with that
secret, which is why `wss://api.openai.com` is in `connect-src` — derived from the
endpoint by `realtimeOrigins()` (`$lib/ai/realtime`) the way the map's origins are
derived from its style URLs — and why `Permissions-Policy` now reads
`microphone=(self)`.

**Instructions and voice are set at mint time, on purpose.** A `session.update`
only changes the fields it carries, so the browser states how it _listens_
(`voiceSession()` — semantic VAD, input transcription, audio out) and never what it
is _told_: a caller who reshaped the update it sends would still be talking to this
organization's assistant. The spoken persona is `VOICE_INSTRUCTIONS` in `prompts.ts`,
which shares its tool discipline with the typed one — `TOOL_DISCIPLINE`, written once
— and differs only where the shape of an answer does: two or three sentences at a
time, no markdown, money and dates said the way a person says them.

**Tools run on the server, with the caller's own session.** The model is at the far
end of a socket the browser holds, so a tool call comes back through
`POST /assistant/realtime/tool`, and `runVoiceTool()` gates it exactly as a typed turn
is gated: the name must be a tool this caller may use right now, the input is
validated against that tool's own schema, `requireToolContext()` checks again inside
the tool, and RLS and the column grants apply underneath. The browser is a relay, not
the thing with the permissions. A tool that fails answers with its message rather than
throwing, because a tool call with no output leaves the model waiting for one.

The AI SDK's realtime guide asks for an endpoint per tool rather than one that runs a
tool by name, on the grounds that a generic route is easy to build without
authentication, validation or authorization. This app has a generic route _and_ all
three, in the one place that already expresses them for every tool — seventeen
endpoints repeating that would be seventeen chances to leave one out. That is the
deviation, and this paragraph is it being surfaced rather than quietly taken.

**A call offers fewer tools than a thread**, by exactly one: anything in
`TOOL_APPROVAL` is withheld (`voiceToolNames()`). Approval is a card with Approve and
Deny on it and a call has no cards; a spoken "yes" is not a decision this app can
evidence afterwards, and the tool behind that gate deletes data. Deleting is what the
typed thread is for.

**The screen is `Assistant.Call`** — `ui/dialog` rather than `Modal`, which is the
documented exception (`Modal` is a tray holding a card; a call is a room you step
into), keeping the focus trap and the Escape because it is still something you are
inside. It is the orb, what it is doing, and the last thing either of you said, and
nothing else: on a call there is nothing to read, only something to listen to, and the
one line of transcript is there so you can check a name you half-heard. Closing it IS
hanging up — the `$effect` that opens the call tears it down, so the button, Escape, a
click outside and navigating away all release the microphone through the same line.

**`Assistant.Orb`** is what you talk to: six conic gradients turning at different
rates behind a blur and a contrast curve, which is what makes the colours look like
they move through a liquid rather than cross-fade, grained with a dot grid in the
page's own background colour. Every measurement scales off `size`, because the effect
does not survive being resized on its own — at 32px the blur of a 192px orb is the
whole orb. It is painted from `--primary` with relative `oklch()`, so it follows the
theme, and it knows only how loud and how fast: `Assistant.Call` maps the call's state
onto those, and `/components` → Badges & avatars shows the range. The orb swells with
**your** voice and not the assistant's — while it is talking, the microphone hears an
echo-cancelled room, and a swell from that would be the orb reacting to itself, so
speaking gets a breath of its own instead.

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

The model comes from `src/lib/server/ai/provider.ts` and nowhere else: `OPENAI_API_KEY`
turns the assistant on, `AI_MODEL` picks the model (default `gpt-5.6-luna`; the larger
GPT-5.6 siblings are `gpt-5.6-terra` and `gpt-5.6-sol`). `createOpenAI()`'s model factory
selects the Responses API for a GPT-5 model, which is the API the SDK's OpenAI tools,
reasoning and prompt caching are built on. The provider package is imported in that one
file; everything else holds the SDK's `LanguageModel`. Unconfigured, the page says so and
the endpoint answers 503.

What the API is asked for on a call is the SDK's namespaced `providerOptions`, spelled once
in `openaiCallOptions()` (`provider.ts`) and set on the agent and on the title call:

- `store: false` — a turn over an organization's data is not retained on OpenAI's side.
  The thread is ours (`conversations.ts`), and with storage off the SDK asks for the
  model's encrypted reasoning and carries it between the steps of a tool loop itself.
- `promptCacheKey`, the thread id — OpenAI caches the longest stable prefix of a request
  (instructions, tool definitions, the thread so far) and the key routes every turn of a
  thread to the same cache.

Reasoning effort is the model's default — `medium` on `gpt-5.6-luna` — and its summaries
stream as `reasoning` parts, which the page folds. When a screen needs a different effort,
it is the SDK's portable `reasoning` setting on the call, never `reasoningEffort` in the
provider block: the thread title (`src/lib/server/ai/title.ts`) is one `generateText` call
with `reasoning: 'none'`, because six words need no thinking and the thinking would count
against its small output budget.

Instructions are two system messages (`src/lib/server/ai/prompts.ts`): the stable persona,
then a `<session_context>` block with the org, the caller, their role and the time zone.
The split is the cache boundary: the persona (and the tool definitions the SDK sends in a
stable order) is the prefix served from the cache on every turn, and the per-request block
after it never invalidates that prefix.

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
| `listEvents`      | calendar  | read   |          |
| `exploreGraph`    | graph     | read   |          |

`activeToolNames(org)` (`tools/index.ts`) keeps a tool only when the feature's mode for
the org is `enabled` **and** the caller holds the level — the same intersection the hook
enforces for pages. The result is the agent's `activeTools`, so the model never sees a tool
it may not call: switch tasks off for an org and the task tools vanish from the model's
view; a member holding only `read` on tasks can list them and nothing more. Every tool
still runs `requireToolContext()` first, so a stale call replayed from a stored thread
fails as a tool error the model can explain rather than reaching a data module.

### Tools addressed by kind

The tools above are one per feature, each with that feature's own filters. A second
family serves **every kind of record with a page** through one door each, the way one
route serves every record page (`(app)/[kind=record]/[id=guid]`) and one form creates and
edits every kind — the generic record layer (`$lib/server/crm/records`,
`$lib/server/records`) rather than a tool per table:

| tool                    | access                  | what it does                                                                                                                                                                                                 |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `findRecords`           | read on the kind        | Records of one kind by name (`listRecordNames()`), ids to pass on.                                                                                                                                           |
| `getRecord`             | read on the kind        | One record as its page shows it — fields (a field naming another record carries its kind and id), custom fields, tags, related records, relationships, latest activity — plus `editableFields` for a writer. |
| `updateRecord`          | manage on the kind      | A partial edit through `patchRecord()`: the named fields change, the rest keep their values, the kind's schema validates and `writeRecord()` writes.                                                         |
| `linkRecords`           | manage on the from kind | Draws a relationship of a type, refusing an open duplicate — the record page's rule.                                                                                                                         |
| `listRelationshipTypes` | read on any kind        | The relationship types, with both labels and the kinds each end must be.                                                                                                                                     |

Their `ToolAccess` is the second shape, `anyOf`: the tool is **offered** while any record
kind's feature is open to the caller at the level, and each call re-checks the one kind it
names with `recordAccess(kind, level)` — the kind's feature, on the same ladder. So a kind
whose feature the org, its tier or its industry withholds is refused inside the call, and
the model is told which kinds exist up front: the session block lists every kind this
caller may read, **in the industry's words** (`recordKindAccess()` — "contact — Patients
(one: patient) — read, update"), so it asks for a patient as `kind: 'contact'` and never
for a kind that does not exist here. `canOpenFor(org)` is the record page's `canOpen`
answered from the tool context, and it decides what a related group, a relationship's
other end or a graph node names — exactly what the page would link, never more.

**Traversal** is two tools. `getRecord` is the one-hop view — the records that point at
this one and the relationships it stands in, each with an id to follow — and
`exploreGraph` is the neighbourhood: a breadth-first walk over the org's `relationships`
rows from one record, up to three hops and forty nodes, naming records through their
list modules and members through the roster exactly as the graph page does. The walk
never steps onto a kind the caller may not open, so nothing beyond such a record is
reached through it. It is the `graph` feature's tool, since that is the page that draws
the graph whole. The instructions tell the model to draw conclusions only from what those
two returned, to name the records and relationships a conclusion rests on, and to say when
the graph shows no connection.

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
the two maps in `tools/index.ts`, a label in `src/lib/ai/labels.ts`, and a case in
`sourcesOf()` (`src/lib/ai/sources.ts`) saying which records its output names. The type of
`AssistantUIMessage` follows, so the page's `tool-<name>` part is typed on arrival. A tool
about a kind of record takes the kind as input and checks `recordAccess()` per call rather
than adding a file per kind.

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
- **A saved call.** A voice call's transcript lives as long as the call — the screen
  shows it a turn at a time and nothing is written to `assistant_messages`. Saving one
  means mapping messages the realtime session assembled onto the thread's own shape so
  that `validateUIMessages` accepts them on reload, and a half-mapped thread that fails
  to load is worse than a call that was only a call. A thread you want to keep is the
  typed one.
- **`experimental_toolApprovalSecret`** — with the server owning the thread and merging
  only approval decisions, a forged approval cannot rewrite a tool call; add the secret if
  the trust model ever changes.
