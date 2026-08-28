# Query keys & intentional invalidation

SvelteKit doesn't ship a query cache like TanStack Query — its unit of freshness is the
**load function**, and its cache key system is **dependency tracking**. Used deliberately,
`depends()` / `invalidate()` gives you the same discipline as query keys: every piece of
server data has a name, and refreshing it is an explicit, targeted act.

This file is the convention. The goal: **never reach for `invalidateAll()`** — it's the
"turn it off and on again" of data loading, and every use of it hides a dependency you
failed to name.

## How SvelteKit decides to rerun a load

A `load` function reruns when (see [Rerunning load functions](https://svelte.dev/docs/kit/load#Rerunning-load-functions)):

1. A property of `params` it references changes.
2. A property of `url` it references changes (`url.pathname`, `url.search`, …).
   Search params are tracked **independently**: calling `url.searchParams.get('page')`
   makes the load rerun when `?page=` changes, but not when an unrelated param does.
3. It called `await parent()` and a parent load reran.
4. It declared a dependency on a URL via `fetch(...)` (universal loads) or on an
   identifier via `depends(...)`, and that URL/identifier was passed to `invalidate(...)`.
5. Someone called `invalidateAll()` (avoid — see below).

Everything else — a form action completing, navigation between pages that share a
layout — does **not** silently refetch. That's a feature: data has to be invalidated
_intentionally_.

## The convention: named query keys

A query key is a custom identifier in the shape:

```
<domain>:<entity>[:<id>]
```

- lowercase, colon-separated, and it **must** start with `[a-z]+:` (SvelteKit requires
  the URI-like scheme prefix)
- `<domain>` groups a feature area; this template reserves `supabase:` for the auth
  layer and uses `app:` for application data
- add the `:<id>` segment when a page loads a single record, so you can refresh one
  record without refetching lists

Declare keys as constants next to the domain they describe, not as string literals
scattered through the app:

```ts
// src/lib/queries.ts
export const QUERY = {
	auth: 'supabase:auth',
	todos: 'app:todos',
	todo: (id: string) => `app:todos:${id}` as const
} as const;
```

### Declaring: `depends()` in the load

```ts
// src/routes/(app)/todos/+page.server.ts
import { QUERY } from '$lib/queries';

export const load = async ({ locals: { supabase }, depends }) => {
	depends(QUERY.todos);

	const { data: todos } = await supabase.from('todos').select('*').order('created_at');
	return { todos: todos ?? [] };
};
```

### Refreshing: `invalidate()` at the event source

```ts
import { invalidate } from '$app/navigation';
import { QUERY } from '$lib/queries';

// After a client-side mutation that a load can't see:
await invalidate(QUERY.todos);

// Multiple keys — run concurrently, not sequentially:
await Promise.all([invalidate(QUERY.todos), invalidate(QUERY.todo(id))]);
```

`invalidate()` also accepts a predicate when you genuinely need a family match:

```ts
await invalidate((url) => url.href.startsWith('app:todos'));
```

## What you get for free (don't double-invalidate)

**Form actions already refresh everything.** A `use:enhance` form, on success, calls
`invalidateAll()` as part of emulating the browser's native behavior. So the default
mutation path — form action → redirect or success — needs **no manual invalidation**.
If you take over the callback, `update()` restores that behavior and lets you tune it:

```svelte
<form
	method="POST"
	use:enhance={() => {
		return async ({ update }) => {
			// invalidateAll: false = keep other loads; then refresh only what changed
			await update({ invalidateAll: false });
			await invalidate(QUERY.todos);
		};
	}}
>
```

Reach for that opt-out only when a page composes several expensive loads and the action
touches one of them; otherwise the default is correct and simpler.

**URL-driven state invalidates itself.** If the load reads
`url.searchParams.get('page')`, navigating to `?page=2` reruns it. Prefer putting
filter/sort/pagination state in the URL over `$state` + manual fetches — you get
back/forward, sharable links, and correct invalidation with zero code.

## Where manual invalidation is the right tool

- **Auth state.** The root `+layout.ts` declares `depends('supabase:auth')`;
  `onAuthStateChange` in `+layout.svelte` calls `invalidate('supabase:auth')` when the
  session actually changes. Every load that cares about the session declares the same
  key. This is wired up in the template already.
- **Supabase Realtime.** A subscription callback is the canonical "event a load can't
  see":

  ```ts
  supabase
  	.channel('todos')
  	.on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
  		void invalidate(QUERY.todos);
  	})
  	.subscribe();
  ```

- **Fetches from `+server.ts` endpoints.** If a page mutates through an API endpoint
  (drag-and-drop reorder, canvas upload), the endpoint response doesn't touch the load
  system — invalidate the affected keys after the fetch resolves.
- **Polling / focus refresh.** `setInterval(() => invalidate(QUERY.dashboard), 30_000)`
  or a `visibilitychange` handler.

## Rules of thumb

1. **Name every non-trivial load.** If data can change while the user is on the page,
   the load gets a `depends()` key — even before anything invalidates it. The key is
   documentation of what the load owns.
2. **Invalidate at the event source,** immediately after the thing that changed the
   data, not in some distant component that happens to notice.
3. **Match granularity to the mutation.** Editing todo 42 invalidates
   `app:todos:42` _and_ `app:todos` (the list shows derived fields); creating one
   invalidates only the list.
4. **`invalidateAll()` is a code smell** outside of "sign-out, nuke everything."
   When tempted, ask: which load am I actually trying to rerun? Name it.
5. **Loads must be side-effect free.** Invalidation reruns them at unpredictable
   times; a load that writes anything will write it repeatedly.
6. **Don't fight tracking.** If a load reads `url` or `params` incidentally and you
   _don't_ want reruns from it, wrap the read in `untrack(() => ...)` rather than
   restructuring the load.
