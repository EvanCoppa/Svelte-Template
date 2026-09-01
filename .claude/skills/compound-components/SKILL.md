---
name: compound-components
description: How reusable multi-part components are built in this project — the compound component pattern (namespace-exported parts composed in page markup, page owns the data). MUST be used whenever creating a reusable component with more than one visual region, extracting repeated page structure into a component, refactoring prop drilling or a config-object "god prop", or adding shared state between a parent component and its parts. Triggers on "compound component", "reusable component", "component with slots/sections", "break this component up", and any new component under src/lib/components/ that has multiple named areas.
---

# Compound components

The preferred shape for every reusable multi-part component in this project is the
**compound component**: a folder of small parts exported as a namespace and composed
directly in page markup, exactly like the vendored `Card`:

```svelte
<Card.Root>
	<Card.Header>
		<Card.Title>{project.name}</Card.Title>
		<Card.Description>{project.summary}</Card.Description>
		<Card.Action><Button onclick={archive}>Archive</Button></Card.Action>
	</Card.Header>
	<Card.Content>…</Card.Content>
</Card.Root>
```

## Why this pattern (the reasoning behind every rule below)

**The page owns the data.** Data arrives via the load function, lives in
`+page.svelte`, and flows into each part as a prop *at the point where that part is
rendered*. Anyone reading the page sees the whole picture in one place: what data
exists, which region shows it, which handler each button calls. The alternatives
both hide that picture:

- **Prop drilling** — a monolithic component that takes everything at the top and
  threads it down through private children. The page shows one opaque tag; to learn
  what happens you must open three files.
- **Config-object "god props"** — `<DataPanel config={{ title, actions: [...],
  columns: [...] }} />`. Structure becomes data, snippets become impossible,
  TypeScript help degrades, and every new need grows the object.

Compound components invert both: structure stays in markup where it is visible and
per-page flexible, while the parts stay reusable everywhere.

## When to use it — and when not

Reach for a compound component when a reusable piece of UI has **two or more named
regions** the page should control (header/body/footer, trigger/content, item/label),
or when parts need to coordinate (selection, open state, registration).

Do **not** compound-ize:

- Single-element wrappers (`Button`, `Input`, badge-like things) — one component.
- One-off page sections used in exactly one route — keep the markup on the page;
  extract only when a second usage appears.
- A job an existing `ui/` or `enhanced/` component already solves — CLAUDE.md rule 1:
  never introduce a second pattern for a solved problem. Check `/components` (it
  covers both shelves) first, and add missing shadcn primitives with
  `npx shadcn-svelte@latest add <name>` rather than hand-building.

## The two tiers

Pick the simplest tier that works — structural first, context only when parts must
actually coordinate.

### Tier 1 — structural (the `ui/card` pattern)

Parts are independent styled elements that happen to compose well. **No shared
state, no context.** Each part is a ~20-line file:

```svelte
<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="thing-header"
	class={cn('…tailwind…', className)}
	{...restProps}
>
	{@render children?.()}
</div>
```

The house mechanics, all mandatory:

- `ref = $bindable(null)` + `bind:this={ref}` so consumers can reach the element.
- `class: className` merged through `cn()` so pages can extend styling.
- `...restProps` spread last so any HTML attribute/handler passes through.
- `data-slot="<component>-<part>"` on the root element — used by parent selectors
  (see Card's `has-data-[slot=card-action]`) and by E2E tests, since compound parts
  often render `<div>`s with no heading role.
- `children?: Snippet` rendered with `{@render children?.()}` — snippets, never
  deprecated slots.

### Tier 2 — stateful (the `ui/sidebar` pattern)

When parts must coordinate — open/collapsed, active selection, keyboard handling —
the shared state is a **class of runes in a colocated `context.svelte.ts`**, set by
`Root` and read by parts. Model it on
`src/lib/components/ui/sidebar/context.svelte.ts`:

```ts
import { getContext, setContext } from 'svelte';

type Getter<T> = () => T;

export type ThingStateProps = {
	// Getters (not raw values) so `bind:` on Root stays the single source of truth.
	value: Getter<string>;
	setValue: (value: string) => void;
};

class ThingState {
	readonly props: ThingStateProps;
	value = $derived.by(() => this.props.value());
	open = $state(false);

	constructor(props: ThingStateProps) {
		this.props = props;
	}

	select = (value: string) => this.props.setValue(value);
}

const SYMBOL_KEY = 'app-thing'; // ui/ components use 'scn-*'; app-level ones use 'app-*'

export function setThing(props: ThingStateProps): ThingState {
	return setContext(Symbol.for(SYMBOL_KEY), new ThingState(props));
}

export function useThing(): ThingState {
	const state = getContext<ThingState | undefined>(Symbol.for(SYMBOL_KEY));
	if (!state) throw new Error('Thing.* parts must be used inside <Thing.Root>.');
	return state;
}
```

Rules that keep this tier honest:

- **Context carries coordination state only** — open/active/hover/registration.
  Application data (rows, profiles, anything from a load function) still enters
  through props on the parts, from the page. If you find yourself putting fetched
  data into context, you have rebuilt prop drilling with extra steps.
- Bindable root props cross the context as **getter functions + setter** (see
  `SidebarStateProps` for why): a copied value would go stale; the getter keeps
  `bind:` on `Root` the source of truth.
- Keys are `Symbol.for('<prefix>-<name>')`, defined once in the context module.
- The `use*` accessor throws a message naming the required Root — a silent
  `undefined` becomes an unrelated crash three components away.
- The class exposes methods/getters; consumers never destructure it (destructuring
  breaks reactivity on class fields).

If the widget needs real interaction plumbing — focus trapping, typeahead,
portalling, ARIA state machines — don't hand-roll the behavior even inside a
compound: build the parts as thin wrappers over a **bits-ui** primitive, the way
`ui/tabs` wraps `TabsPrimitive.Root/List/Trigger/Content`.

## File anatomy

One folder per component, kebab-case files, `index.ts` namespace:

```
src/lib/components/<name>/          # app-level compounds live here
├── <name>.svelte                   # exported as Root
├── <name>-<part>.svelte            # one file per part
├── context.svelte.ts               # tier 2 only
└── index.ts
```

`index.ts` follows `ui/card/index.ts` exactly — `Root`/part names plus flat aliases:

```ts
import Root from './thing.svelte';
import Header from './thing-header.svelte';
import Item from './thing-item.svelte';

export { Root, Header, Item, Root as Thing, Header as ThingHeader, Item as ThingItem };
```

Pages import the namespace: `import * as Thing from '$lib/components/thing/index.js';`

Placement: app-level compounds go in `src/lib/components/<name>/`. `ui/` is reserved
for shadcn-vendored primitives (added via the CLI), `enhanced/` for Solid Core ports —
don't add hand-written compounds to either shelf.

## Page-owns-data rules (what the parts may and may not do)

- Parts **never fetch**. No `onMount` loads, no Supabase clients, no `page.data`
  reads inside a part. Data: load function → page → prop. Freshness stays the
  page's job via the named query keys in `src/lib/queries.ts`.
- Repeated content renders through **`{#each}` on the page over an `Item` part**,
  or a snippet prop when the component must control iteration order/placement:

  ```svelte
  <Thing.Root>
  	{#each data.projects as project (project.id)}
  		<Thing.Item onSelect={() => open(project)}>{project.name}</Thing.Item>
  	{/each}
  </Thing.Root>
  ```

- Events go **up as callback props** (`onSelect`, `onOpenChange`) declared in
  `$props()` — never `createEventDispatcher`, never mutating a prop object.
- Mutations stay on the page: a part renders the `<form>`/button markup it is
  given; the form action, superForm wiring, and toast live in the route
  (see the `sveltekit-superforms` skill).
- Styling: Tailwind tokens from `src/app.css` only — no hardcoded greys, and any
  raw palette color needs its `dark:` pair. Animations go through `$lib/motion.js`.
- Icons stay one-per-file imports (`@lucide/svelte/icons/<name>`).

## Reference implementations (read before writing)

- `src/lib/components/ui/card/` — tier 1, the minimal structural compound.
- `src/lib/components/ui/sidebar/` — tier 2, class-in-context with bindable root
  state, mobile branching, and keyboard handling.
- `src/lib/components/ui/tabs/` — compound as thin bits-ui wrappers.
- `src/routes/(app)/settings/+page.svelte` — a page composing compounds while
  owning all data and actions.

## Before finishing

- Compose the new component on its consuming page and confirm every part receives
  its data as a visible prop in the page markup — the readability test this pattern
  exists for.
- Follow the `svelte-code-writer` skill's tooling for every `.svelte` /
  `.svelte.ts` file you touch, and check live Svelte docs (`/llms.txt` routes) for
  any runes/snippet API you're unsure of.
- `npm run check`, `npm run lint`, and `npm run knip` all stay at zero — knip will
  flag unused `index.ts` aliases if you export parts nothing uses yet; export only
  what exists.
