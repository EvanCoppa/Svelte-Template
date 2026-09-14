# Assistant artifacts: a tool result that earned a component

An **artifact** is a component the thread draws for one tool call — the answer rendered
rather than narrated. It is this app's take on the generative UI the AI SDK documents
(`node_modules/ai/docs/04-ai-sdk-ui/04-generative-user-interfaces.mdx`), and the name is
worth reading carefully, because the idea is smaller than it sounds: **the model never
generates markup.** It chooses a tool; the tool returns typed output; the output picks a
component we wrote. Every pixel is still ours, still reviewed, still painted from
`app.css` tokens. What the model contributes is the choice of which one appears.

(The industry docs use "artifact" for the document a sale produces — a proposal, a
statement analysis. Here it means one thing only: the rendered form of a tool result.)

**The default is still a line in `Assistant.Activity`, and that is not laziness.** A
conversation is a column of prose, and a card dropped into it interrupts reading. Most
tool calls are the assistant clearing its throat — a lookup on the way to an id, a write
whose whole content is "done" — and drawing them would turn an answer into a dashboard
nobody asked for. The artifact is the exception that earns its interruption. What this
document asks for is that the exception be **decided every time**, in the open, rather
than defaulted into or out of.

## The three places a tool call can land

`Assistant.Message` already splits tool parts two ways on the state machine the SDK gives
them. Artifacts make it three:

| Where                | When                                                               | Why                                                                                   |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `Assistant.ToolCall` | `approval-requested`, `approval-responded`, `output-denied`        | The call is a **question**, and a question needs an answer before the turn continues. |
| An **artifact**      | `output-available`, for a tool whose result was judged to earn one | The result **is** the answer, and prose would lose its shape.                         |
| `Assistant.Activity` | everything else                                                    | The call is the working, not the answer.                                              |

**A call lands in exactly one of the three.** A tool with an artifact does not also
appear in the activity line's count, or the thread reports the same call twice — once as
a picture and once as a tally — and the reader has to work out that they are the same
event. Approval outranks artifact: a call the reader denied must never render as though
it produced something, which is the same reason `isApproval()` already keeps denials out
of the activity line today.

The pre-settled states stay with the activity line whatever the tool. While a call is
`input-streaming` or `input-available` there is no output to draw, and a skeleton of the
artifact-to-come is a worse wait than the line that names what is running — the line
already animates, already flips one tool up as the next arrives, and already honours
`prefers-reduced-motion` through `$lib/motion`. `output-error` stays there too: the
failure is one sentence with a warning triangle, and an artifact has nothing to render.

## The question to ask, every time a tool is added

Five questions, in order. The first that answers clearly decides it.

1. **Does the output have shape that a sentence loses?** A list of twenty companies, a
   funnel of deals by stage, a week of appointments — these are structures, and the model
   flattening them into prose is a downgrade the reader can feel. One row, one number,
   one boolean is a sentence, and the model writes better sentences than a card does.
2. **Will the reader act on it?** Picking one of several, comparing two, opening one to
   go on working — that is a list wanting to be a list, with links. If there is nothing
   to do with the result but read it, prose is doing the job.
3. **Is this the answer, or a step toward it?** `searchCompanies` says in its own
   description "Call this before any tool that needs a company id". A lookup the model
   performs on its way somewhere is working, not output. Where a tool is genuinely both —
   sometimes terminal, sometimes a step — decide on whether the result stays useful once
   the model has moved past it. A list of matches does; a single row fetched for its id
   does not.
4. **Would it repeat the sentence beside it?** "I created the task _Call the roofer_" is
   already complete. A card next to it saying _Call the roofer_ is the same fact twice,
   and two copies of a fact read as two facts. Writes almost always fail this question,
   which is why they are the clearest "no" in the table below.
5. **Does it already have a home?** The record has a page; the context rail already lists
   what the answer drew on. An artifact that duplicates either one is a third place for
   the same thing to drift.

If the answer is an artifact, it is worth building **properly** — the sections below are
the contract. If the answer is the activity line, that is a real answer, and it is
recorded in the same map, so the next person inherits a decision rather than an omission.

## The decision is compulsory, because the map is total

Which tools have artifacts lives in `src/lib/ai/artifacts.ts` as one map keyed by tool
name — the fourth such map, after `assistantTools`, `TOOL_ACCESS` and `TOOL_LABELS`, and
declared the same way:

```ts
export const TOOL_ARTIFACT = {
	searchCompanies: 'artifact',
	getCompany: 'artifact',
	addNote: 'activity',
	createTask: 'activity'
	// …
} satisfies Record<AssistantToolName, 'artifact' | 'activity'>;
```

The `satisfies Record<AssistantToolName, …>` is the point of the whole document. A map
of only the tools that have artifacts would let a new tool be added without anyone
thinking about it; a **total** map does not compile until the new tool is given a value.
So "consider building an artifact for it" stops being a convention people remember and
becomes a type error they cannot merge past. `TOOL_LABELS` already earns its keep the
same way.

The renderer is a `switch` over the tool union, exactly like `sourcesOfPart()` in
`src/lib/ai/sources.ts`: exhaustive, narrowed by `part.type`, no cast anywhere, one
branch per artifact delegating to a component in
`src/lib/components/assistant/artifacts/`. A registry of components keyed by tool name
would need a cast at the render site to correlate the key with the value — and a `check`
finding is never silenced with a cast.

## The decisions so far

None of these are built yet. The table is the backlog and, more importantly, the
precedent — the reasoning is the part worth copying.

| tool              | renders as | why                                                                         |
| ----------------- | ---------- | --------------------------------------------------------------------------- |
| `searchCompanies` | artifact   | A result list the reader picks from; stays useful after the model moves on. |
| `getCompany`      | artifact   | A record summary — relationship, status, contacts — that prose flattens.    |
| `searchContacts`  | artifact   | Same as `searchCompanies`.                                                  |
| `listTasks`       | artifact   | Status, priority and due date are pills; a sentence has to spell each one.  |
| `listDeals`       | artifact   | Grouped by stage, it is a funnel; listed in prose, it is twenty clauses.    |
| `listTickets`     | artifact   | Priority and status carry the meaning, and the reader opens one.            |
| `addNote`         | activity   | One fact, said better in a sentence; the note's home is the record page.    |
| `createTask`      | activity   | The sentence names it; the rail already carries it as a source to open.     |
| `completeTask`    | activity   | Same, and "done" has no shape.                                              |
| `deleteTask`      | card       | Approval outranks artifact — it is a question before it is a result.        |

## What an artifact may and may not be

- **It renders `part.output` and nothing else.** The tool already ran, under RLS, as the
  caller, through a `$lib/server/crm/*` module. An artifact never fetches, never calls an
  endpoint, never reaches for `page.data` to fill a gap — if it needs a field, the field
  belongs in the tool's `outputSchema`, where the model can see it too.
- **It is a read, not a control.** No mutation starts inside an artifact. A button in the
  thread that writes would be a `fetch` born on a page that has form actions, which the
  repo's mutation rule forbids, and it would bypass the approval mechanism that exists
  precisely so destructive acts are answered rather than clicked. The reader acts on the
  record's own page; the artifact links them there.
- **A link is only ever a door the reader may open.** The rule the context rail and the
  generic record page already follow: a kind appears only when `terms` carries its
  feature, which is exactly the set this session may see. An artifact that links a record
  behind a feature the org disabled offers a 404 with a nice icon on it.
- **The output is trustworthy; the input is not.** `part.output` is our own data module's
  return value. `part.input` is the model's — a search string it composed — so it renders
  as text, never through `{@html}`, on the same grounds as `Assistant.Markdown`.
- **It is built from the primitives, like every other screen.** A list artifact is
  `DataTable`; a record summary reuses the `detail/` parts; a board is `Kanban`. An
  artifact is not a licence to hand-roll a table for the thread, and the one-established-
  way rule does not pause inside a conversation.
- **It must survive its own history.** Outputs are stored verbatim in
  `assistant_messages` and replayed on reload, so an artifact renders from the stored
  shape alone and degrades to nothing — not to a crash — when it meets a shape it no
  longer recognises. `toolLabel()`'s fallback for a tool the registry has forgotten is
  the precedent.
- **It lives in a column, not on a page.** The conversation is one column, and the
  context rail hides below `lg` precisely so the thread keeps its width. An artifact is
  built for that column at its narrowest, and anything wider than it scrolls inside its
  own frame rather than widening the thread.

## Adding one

1. Answer the five questions and put the verdict in `TOOL_ARTIFACT`. A tool that is not
   in the map does not compile.
2. If it is `'activity'`, you are done — that was the decision, and it is recorded.
3. If it is `'artifact'`, write the component in
   `src/lib/components/assistant/artifacts/<tool-name>.svelte`, taking the narrowed part
   as its one prop.
4. Add its branch to the artifact renderer's `switch`, and export the new part from the
   assistant barrel if the page composes it directly.
5. Check the tool's `outputSchema` still carries everything the artifact draws — widening
   it changes what the model sees as well, which is usually an improvement and always a
   decision.

## An artifact is not the rail, and not a data part

Three mechanisms sit near each other and answer different questions:

- An **artifact** is _the answer_, drawn in the thread where the call happened.
- The **context rail** (`sourcesOf()`, `AssistantContext`) is _what the answer drew on_ —
  every record the whole thread touched, deduplicated, outliving the turn that found it.
  A record belongs in both without duplication, because they are different claims about
  it.
- A **data part** (`createUIMessageStream` + `writer.write({ type: 'data-…' })`) is UI
  that is _not a tool result at all_ — progress, a status line, a notice. The message
  type's second parameter is `never` until one exists, and it stays that way: a thing the
  reader can see should almost always be something a tool returned, because that is the
  form the model can also reason about.

## Where this stands today

The seam described here is specified, not built. `Assistant.Message` currently routes
tool parts two ways, and `src/lib/ai/artifacts.ts` does not exist yet. The first artifact
adds all three pieces at once — the total map, the renderer, and one component — and
every one after it is a value in the map plus a branch.
