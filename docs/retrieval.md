# Retrieval

> The assistant answering from what the organization **wrote**, not just from what it
> recorded. `content_chunks` + `$lib/ai/chunks.ts` + `$lib/server/crm/chunks.ts` +
> `$lib/server/ai/retrieval.ts` + the `searchDocuments` tool.

## Why it exists

Every other tool the assistant has reads a column — a deal's stage, an invoice's balance,
a contact's email. None of them can answer _why the discount was agreed_, _what the crew
found on the roof_, or _what we promised in the meeting_. Those live in prose, and prose
is what [documents](documents.md) added.

So this is the second index over the same writing. `entity_references` says what a page
**names**; `content_chunks` says what it **says**.

## It is not `document_chunks`

CLAUDE.md: _one polymorphic link, not one per table._ A chunk table keyed to
`document_id` would be the second mechanism the first time a note, a ticket thread or a
visit write-up wanted the same treatment — and every one of them will.

So a chunk points at its source through the link the whole CRM shares, which buys three
things for nothing: `private.crm_entity_exists()` validates the pointer,
`private.on_crm_entity_gone()` deletes the passages when the source is deleted, and **a
new kind joins retrieval with no migration** — a chunker beside `chunkDocument()` and one
call to `indexChunks()`. Documents are simply the first source.

## A chunk is not a block

A block is a paragraph, and a paragraph alone usually cannot answer anything — "it needs
replacing" is useless without knowing what "it" is. `chunkDocument()` accumulates blocks
into passages under a character budget and prefixes each with the heading trail above it:

```
Site report › North elevation

The parapet flashing has failed and needs full replacement.
```

Two rules do most of the work. **A heading always starts a new passage**, because that is
where the subject changes; and **a passage never spans a heading**, because the trail
printed at its top would be a lie about half of it. There is deliberately no overlap —
overlap guards against arbitrary boundaries, and these boundaries are the ones the author
made.

**This is deterministic code and a model never does it.** The same line the notes plan
draws around arithmetic, for the same reasons: correctness, latency and testability. It
is tested in node with no key and no network.

## The write path never embeds

A save stores the **text** of every passage that changed and leaves its vector null; the
read path tops up what is pending before it searches. Three things fall out of that, and
all three are the reason for it:

- **Typing costs nothing.** The editor autosaves every few hundred milliseconds; a save
  that called an embedding API would be a bill and a latency spike per keystroke burst.
- **A save can never fail because a provider is down.** The writing lands and the index
  catches up — the same order `saveDocument()` already uses for the reference index.
- **The index is self-healing.** After an outage, a key rotation or a model change, the
  pending rows are found and filled on the next question. Nothing has to remember to run,
  which matters because **nothing in this app runs background work** — and inventing a
  worker for this would be a second infrastructure.

The cost is that the first question after a big edit pays to embed what changed. It is
capped (`TOP_UP_LIMIT`, 32) so that stays a pause rather than a hang.

**The hash is what makes this cheap.** `content_hash` is per passage, so editing paragraph
three re-embeds paragraph three and leaves the other forty — vectors included —
completely alone. Renaming the page is the one edit that touches everything, because the
title is the root of every heading trail; that is rare, and a passage that does not know
which page it came from is worse at exactly the moment retrieval is used.

## Two ways to find a passage, and it says which it used

`searchContent()` embeds the question and calls `match_content_chunks` (cosine distance,
HNSW index, `security invoker` so RLS keeps deciding what is visible). It falls back to
Postgres full-text search over the same rows when:

- no provider is configured — **retrieval works with no API key at all**, which is also
  what makes the feature testable and the template runnable on a bare clone;
- the question could not be embedded (a provider outage);
- meaning found nothing.

The fallback is not a consolation prize: an exact word beats a nearby one for a part
number or an MID. The mode (`vector` | `text`) is returned and the tool reports it, so the
model can be honest about how it found something rather than implying more than it knows.

## The dimension is a schema fact

A vector column has a fixed width, so the model's output size is part of the schema. It is
1536 — `text-embedding-3-small` natively, and `text-embedding-3-large` when asked for 1536
dimensions, which `embeddingCallOptions()` always does. So `AI_EMBEDDING_MODEL` moves
between those two freely.

A model with a different native width needs a migration. Rows carry `embedding_model` so
the old ones can be found and re-embedded — **comparing embeddings from two models is not
an error Postgres can raise**, it just returns nonsense, which is why that column exists.

## Deliberately not here

- **A rerank stage.** A real improvement and easy to add later (`rerank()` ships in the AI
  SDK). It earns its cost when there is enough content for the top 8 to be the wrong 8.
- **A model-written summary column.** Generated content presented as fact, refreshed on a
  cadence nothing runs, going stale silently. The passages are the page's own words.
- **A job queue.** See above — the pending/top-up design exists precisely to avoid one.
- **Chunks of records.** A company row is not prose; `findRecords` and `getRecord` already
  answer questions about fields, and embedding a row would be a worse way to ask them.

## Adding a source

1. A chunker for that kind in `$lib/ai/chunks.ts` — pure, tested.
2. One `indexChunks()` call where that kind is saved.
3. The kind in `searchDocuments`' filter (and its `ToolAccess` becomes `anyOf`, exactly as
   the kind-addressed tools do).

No migration. That is what the polymorphic link bought.

## What is verified, and what is not

The migration replays onto an empty database, and the table, constraints, cascade and the
`match_content_chunks` ordering are exercised in SQL with real 1536-dimension vectors.
Chunking, indexing, the incremental rewrite, the text fallback and the provider-failure
paths are unit tested, the embedding flow against `MockEmbeddingModelV4`.

Indexing was driven end to end in a browser: writing a page stores its passages with the
right heading trails, and editing one paragraph rewrites that passage alone. **The live
vector path has not been run against a real provider** — that needs an `OPENAI_API_KEY`
this environment does not have.
